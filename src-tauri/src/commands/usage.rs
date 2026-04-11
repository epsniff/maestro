//! IPC commands for Claude Code usage tracking.
//!
//! Fetches real rate limit data from Anthropic's OAuth API.
//! Reads OAuth tokens from platform credential store (primary) or credentials file (fallback).

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Instant;

/// Tracks when the credential store last failed.
/// Resets after CRED_STORE_RETRY_SECS so we retry once the user has authenticated.
static CREDENTIAL_STORE_LAST_FAIL: Mutex<Option<Instant>> = Mutex::new(None);

/// How long (seconds) to skip credential store after a failure before retrying.
const CRED_STORE_RETRY_SECS: u64 = 120;

/// Minimum seconds between actual API calls. Requests within this window return cached data.
const CACHE_TTL_SECS: u64 = 30;

/// Cached usage response to prevent duplicate API calls from multiple frontend
/// components or rapid re-renders. Stores (fetch_time, ttl_secs, data).
static USAGE_CACHE: Mutex<Option<(Instant, u64, UsageData)>> = Mutex::new(None);

/// Usage data from Anthropic's OAuth API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageData {
    /// Session (5-hour window) usage percentage (0-100).
    pub session_percent: f64,
    /// When the session window resets (ISO 8601).
    pub session_resets_at: Option<String>,
    /// Weekly (7-day window) usage percentage for all models (0-100).
    pub weekly_percent: f64,
    /// When the weekly window resets (ISO 8601).
    pub weekly_resets_at: Option<String>,
    /// Weekly Opus-specific usage percentage (0-100).
    pub weekly_opus_percent: f64,
    /// When the weekly Opus window resets (ISO 8601).
    pub weekly_opus_resets_at: Option<String>,
    /// Error message if token is expired or unavailable.
    pub error_message: Option<String>,
    /// Whether authentication is needed (token expired or missing).
    pub needs_auth: bool,
}

impl Default for UsageData {
    fn default() -> Self {
        Self {
            session_percent: 0.0,
            session_resets_at: None,
            weekly_percent: 0.0,
            weekly_resets_at: None,
            weekly_opus_percent: 0.0,
            weekly_opus_resets_at: None,
            error_message: None,
            needs_auth: false,
        }
    }
}

/// Response from Anthropic's /api/oauth/usage endpoint.
#[derive(Debug, Deserialize)]
struct ApiUsageResponse {
    five_hour: Option<UsageWindow>,
    seven_day: Option<UsageWindow>,
    seven_day_opus: Option<UsageWindow>,
}

#[derive(Debug, Deserialize)]
struct UsageWindow {
    utilization: f64,
    resets_at: Option<String>,
}

/// Credentials structure (same format in file and keychain).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsData {
    claude_ai_oauth: Option<OAuthCredentials>,
}

/// OAuth credentials structure.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthCredentials {
    access_token: String,
    expires_at: u64,
}

/// Check if token is expired (with 60 second buffer).
fn is_token_expired(expires_at: u64) -> bool {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    expires_at < now_ms + 60_000
}

/// Get the current username for credential store access.
fn get_username() -> Option<String> {
    // USER (Unix) or USERNAME (Windows)
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .ok()
}

/// Read credentials from macOS Keychain using the `security` CLI.
/// This avoids permission prompts since `security` is Apple-signed.
#[cfg(target_os = "macos")]
async fn read_keychain_credentials() -> Result<CredentialsData, String> {
    let username = get_username().ok_or("Could not get username")?;

    let output = tokio::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-a",
            &username,
            "-w",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run security: {}", e))?;

    if !output.status.success() {
        return Err("No keychain entry found".to_string());
    }

    let data = String::from_utf8(output.stdout).map_err(|_| "Invalid keychain data")?;

    serde_json::from_str(data.trim()).map_err(|e| format!("Failed to parse keychain data: {}", e))
}

/// Read credentials from platform credential store (Windows/Linux).
/// - Windows: Credential Manager
/// - Linux: Secret Service (D-Bus)
#[cfg(not(target_os = "macos"))]
async fn read_keychain_credentials() -> Result<CredentialsData, String> {
    let username = get_username().ok_or("Could not get username")?;

    let result = tokio::task::spawn_blocking(move || {
        let entry = keyring::Entry::new("Claude Code-credentials", &username)
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

        entry.get_password().map_err(|e| match e {
            keyring::Error::NoEntry => "No credential entry found".to_string(),
            _ => format!("Credential store error: {}", e),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    serde_json::from_str(&result).map_err(|e| format!("Failed to parse credential data: {}", e))
}

/// Read credentials from file (fallback for non-macOS or if keychain fails).
async fn read_file_credentials() -> Result<CredentialsData, String> {
    let home = directories::UserDirs::new()
        .and_then(|dirs| Some(dirs.home_dir().to_path_buf()))
        .ok_or("Could not get home directory")?;

    let creds_path = home.join(".claude").join(".credentials.json");

    if !creds_path.exists() {
        return Err("Credentials file not found".to_string());
    }

    let content = tokio::fs::read_to_string(&creds_path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse file: {}", e))
}

/// Get a valid access token, trying platform credential store first then file.
async fn get_access_token() -> Result<String, String> {
    // Try platform credential store first (skip temporarily after failure to avoid repeated prompts)
    let skip_cred_store = CREDENTIAL_STORE_LAST_FAIL
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|t| t.elapsed().as_secs() < CRED_STORE_RETRY_SECS))
        .unwrap_or(false);

    if !skip_cred_store {
        match read_keychain_credentials().await {
            Ok(creds) => {
                // Clear any previous failure since the store is accessible now
                if let Ok(mut guard) = CREDENTIAL_STORE_LAST_FAIL.lock() {
                    *guard = None;
                }
                if let Some(oauth) = creds.claude_ai_oauth {
                    if !is_token_expired(oauth.expires_at) {
                        log::debug!("Using token from platform credential store");
                        return Ok(oauth.access_token);
                    }
                    log::debug!("Credential store token expired");
                }
            }
            Err(e) => {
                log::debug!("Credential store failed, will use file fallback: {}", e);
                if let Ok(mut guard) = CREDENTIAL_STORE_LAST_FAIL.lock() {
                    *guard = Some(Instant::now());
                }
            }
        }
    }

    // Fall back to credentials file
    let creds = read_file_credentials().await?;
    let oauth = creds.claude_ai_oauth.ok_or("Not logged in")?;

    if is_token_expired(oauth.expires_at) {
        return Err("Session expired".to_string());
    }

    log::debug!("Using token from file");
    Ok(oauth.access_token)
}

/// Fetch usage data from Anthropic's OAuth API.
/// Responses are cached for 30 seconds to prevent 429 errors when multiple
/// components or re-renders trigger concurrent requests.
#[tauri::command]
pub async fn get_claude_usage() -> Result<UsageData, String> {
    // Return cached response if still fresh
    if let Ok(guard) = USAGE_CACHE.lock() {
        if let Some((fetched_at, ttl, ref data)) = *guard {
            if fetched_at.elapsed().as_secs() < ttl {
                log::debug!(
                    "Returning cached usage data (age: {}s, ttl: {}s)",
                    fetched_at.elapsed().as_secs(),
                    ttl
                );
                return Ok(data.clone());
            }
        }
    }

    let result = fetch_usage_from_api().await;

    // Cache successful responses (and auth errors, since those won't change quickly)
    if let Ok(ref data) = result {
        if let Ok(mut guard) = USAGE_CACHE.lock() {
            *guard = Some((Instant::now(), CACHE_TTL_SECS, data.clone()));
        }
    }

    result
}

/// Actually fetch usage data from the API (uncached).
async fn fetch_usage_from_api() -> Result<UsageData, String> {
    let token = match get_access_token().await {
        Ok(t) => t,
        Err(e) => {
            log::debug!("No valid token: {}", e);
            return Ok(UsageData {
                error_message: Some(e),
                needs_auth: true,
                ..Default::default()
            });
        }
    };

    let client = reqwest::Client::new();
    let response = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", "claude-code/2.0.32")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    // Handle auth errors
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        log::debug!("Usage API returned 401");
        return Ok(UsageData {
            error_message: Some("Session expired".to_string()),
            needs_auth: true,
            ..Default::default()
        });
    }

    // Handle rate limiting (429) — extend cache TTL to avoid hammering the API
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(60);
        log::warn!("Usage API returned 429, retry after {}s", retry_after);
        let data = UsageData {
            error_message: Some(format!("Rate limited, retrying in {}s", retry_after)),
            ..Default::default()
        };
        // Cache the 429 response using retry-after as TTL so we don't retry before the server allows
        if let Ok(mut guard) = USAGE_CACHE.lock() {
            *guard = Some((Instant::now(), retry_after, data.clone()));
        }
        return Ok(data);
    }

    if !response.status().is_success() {
        let status = response.status();
        log::warn!("Usage API returned {}", status);
        return Ok(UsageData {
            error_message: Some(format!("API error: {}", status)),
            ..Default::default()
        });
    }

    let api_response: ApiUsageResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    // Helper to convert utilization to percentage
    // API returns 0-1 (multiply by 100) or already 0-100 (use as-is)
    let to_percent = |val: f64| {
        if val > 1.0 {
            val
        } else {
            val * 100.0
        }
    };

    let usage = UsageData {
        session_percent: api_response
            .five_hour
            .as_ref()
            .map(|w| to_percent(w.utilization))
            .unwrap_or(0.0),
        session_resets_at: api_response.five_hour.and_then(|w| w.resets_at),
        weekly_percent: api_response
            .seven_day
            .as_ref()
            .map(|w| to_percent(w.utilization))
            .unwrap_or(0.0),
        weekly_resets_at: api_response.seven_day.and_then(|w| w.resets_at),
        weekly_opus_percent: api_response
            .seven_day_opus
            .as_ref()
            .map(|w| to_percent(w.utilization))
            .unwrap_or(0.0),
        weekly_opus_resets_at: api_response.seven_day_opus.and_then(|w| w.resets_at),
        error_message: None,
        needs_auth: false,
    };

    log::info!(
        "Usage: session={:.1}%, weekly={:.1}%",
        usage.session_percent,
        usage.weekly_percent
    );

    Ok(usage)
}

/* ================================================================ */
/*  CODEX USAGE                                                      */
/* ================================================================ */

/// Cached Codex usage response. Stores (fetch_time, ttl_secs, data).
static CODEX_USAGE_CACHE: Mutex<Option<(Instant, u64, UsageData)>> = Mutex::new(None);

/// Get an OpenAI API key for Codex usage tracking.
///
/// Checks (in order):
/// 1. `OPENAI_API_KEY` environment variable
/// 2. `~/.codex/config.toml` for `api_key` field
/// 3. `~/.codex/auth.json` for OAuth access token
async fn get_codex_api_key() -> Result<String, String> {
    // 1. Environment variable
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.is_empty() {
            log::debug!("Using Codex API key from OPENAI_API_KEY env");
            return Ok(key);
        }
    }

    let home = directories::UserDirs::new()
        .and_then(|dirs| Some(dirs.home_dir().to_path_buf()))
        .ok_or("Could not get home directory")?;

    // 2. ~/.codex/config.toml
    let config_path = home.join(".codex").join("config.toml");
    if config_path.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
            // Look for api_key in TOML (simple line-based parse)
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("api_key") || trimmed.starts_with("openai_api_key") {
                    if let Some(val) = trimmed.split('=').nth(1) {
                        let key = val.trim().trim_matches('"').trim_matches('\'').to_string();
                        if !key.is_empty() {
                            log::debug!("Using Codex API key from config.toml");
                            return Ok(key);
                        }
                    }
                }
            }
        }
    }

    // 3. ~/.codex/auth.json (OAuth tokens from ChatGPT login)
    let auth_path = home.join(".codex").join("auth.json");
    if auth_path.exists() {
        if let Ok(content) = tokio::fs::read_to_string(&auth_path).await {
            // Parse as JSON and look for access_token
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(token) = json.get("access_token").and_then(|v| v.as_str()) {
                    if !token.is_empty() {
                        log::debug!("Using Codex token from auth.json");
                        return Ok(token.to_string());
                    }
                }
            }
        }
    }

    Err("Not logged in to Codex".to_string())
}

/// Fetch Codex usage data.
///
/// Checks for OpenAI credentials and returns usage status.
/// Since OpenAI does not expose a per-user usage percentage API like Anthropic,
/// we validate credentials and return a connected state.
#[tauri::command]
pub async fn get_codex_usage() -> Result<UsageData, String> {
    // Return cached response if still fresh
    if let Ok(guard) = CODEX_USAGE_CACHE.lock() {
        if let Some((fetched_at, ttl, ref data)) = *guard {
            if fetched_at.elapsed().as_secs() < ttl {
                return Ok(data.clone());
            }
        }
    }

    let result = fetch_codex_usage().await;

    if let Ok(ref data) = result {
        if let Ok(mut guard) = CODEX_USAGE_CACHE.lock() {
            *guard = Some((Instant::now(), CACHE_TTL_SECS, data.clone()));
        }
    }

    result
}

/// Actually check Codex credentials and return usage data.
async fn fetch_codex_usage() -> Result<UsageData, String> {
    let api_key = match get_codex_api_key().await {
        Ok(k) => k,
        Err(e) => {
            log::debug!("No Codex credentials: {}", e);
            return Ok(UsageData {
                error_message: Some(e),
                needs_auth: true,
                ..Default::default()
            });
        }
    };

    // Validate the key by making a lightweight API call
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match response {
        Ok(resp) => {
            if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
                log::debug!("Codex API returned 401");
                return Ok(UsageData {
                    error_message: Some("Session expired".to_string()),
                    needs_auth: true,
                    ..Default::default()
                });
            }

            if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                let retry_after = resp
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(60);
                let data = UsageData {
                    error_message: Some(format!("Rate limited, retrying in {}s", retry_after)),
                    ..Default::default()
                };
                if let Ok(mut guard) = CODEX_USAGE_CACHE.lock() {
                    *guard = Some((Instant::now(), retry_after, data.clone()));
                }
                return Ok(data);
            }

            // Connected successfully — OpenAI doesn't expose per-user usage percentages
            // so we return 0% (no usage data available)
            log::info!("Codex: authenticated successfully");
            Ok(UsageData {
                error_message: None,
                needs_auth: false,
                ..Default::default()
            })
        }
        Err(e) => {
            log::warn!("Codex API network error: {}", e);
            Ok(UsageData {
                error_message: Some(format!("Network error: {}", e)),
                ..Default::default()
            })
        }
    }
}
