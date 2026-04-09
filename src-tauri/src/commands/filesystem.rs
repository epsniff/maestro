use serde::Serialize;

/// A single entry in a directory listing.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    /// File or directory name.
    pub name: String,
    /// Whether this entry is a directory.
    pub is_dir: bool,
    /// File extension (lowercase, without dot). Empty for directories and extensionless files.
    pub extension: String,
}

/// Directories/files hidden by default in the file explorer.
const HIDDEN_NAMES: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    "venv",
    ".cargo",
    ".next",
    ".DS_Store",
    "Thumbs.db",
];

/// Lists the contents of a directory, sorted (directories first, then files, alphabetical).
/// Dotfiles/dirs and common build artifacts are excluded by default unless `show_hidden` is true.
#[tauri::command]
pub async fn list_directory(
    path: String,
    show_hidden: Option<bool>,
) -> Result<Vec<DirEntry>, String> {
    let show_hidden = show_hidden.unwrap_or(false);
    let dir = std::path::Path::new(&path);

    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries = Vec::new();

    let read_dir =
        std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden entries unless requested
        if !show_hidden {
            if name.starts_with('.') || HIDDEN_NAMES.contains(&name.as_str()) {
                continue;
            }
        }

        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let extension = if is_dir {
            String::new()
        } else {
            std::path::Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };

        entries.push(DirEntry {
            name,
            is_dir,
            extension,
        });
    }

    // Sort: directories first, then files, alphabetical within each group
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Creates an empty file at the given path. Errors if the file already exists.
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);

    if file_path.exists() {
        return Err(format!("File already exists: {}", path));
    }

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            return Err(format!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }
    }

    std::fs::File::create(file_path).map_err(|e| format!("Failed to create file: {}", e))?;

    Ok(())
}
