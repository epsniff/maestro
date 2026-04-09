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

/// Deletes a file or directory at the given path.
/// For files, uses `remove_file`. For directories, uses `remove_dir_all`.
/// Refuses to delete if the path is not under `project_root`.
#[tauri::command]
pub async fn delete_path(path: String, project_root: String) -> Result<(), String> {
    let target = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    let root = std::path::Path::new(&project_root)
        .canonicalize()
        .map_err(|e| format!("Invalid project root: {}", e))?;

    if !target.starts_with(&root) || target == root {
        return Err("Cannot delete paths outside the project root".to_string());
    }

    if target.is_dir() {
        std::fs::remove_dir_all(&target)
            .map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        std::fs::remove_file(&target)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

/// Renames a file or directory.
/// Refuses to rename if old_path or new_path are outside `project_root`,
/// or if new_path already exists.
#[tauri::command]
pub async fn rename_path(
    old_path: String,
    new_path: String,
    project_root: String,
) -> Result<(), String> {
    let old = std::path::Path::new(&old_path)
        .canonicalize()
        .map_err(|e| format!("Invalid old path: {}", e))?;
    let root = std::path::Path::new(&project_root)
        .canonicalize()
        .map_err(|e| format!("Invalid project root: {}", e))?;

    if !old.starts_with(&root) {
        return Err("Cannot rename paths outside the project root".to_string());
    }

    let new = std::path::Path::new(&new_path);
    // new_path may not exist yet, but its parent must be inside project root
    if let Some(parent) = new.parent() {
        let canon_parent = parent
            .canonicalize()
            .map_err(|e| format!("Invalid new path parent: {}", e))?;
        if !canon_parent.starts_with(&root) {
            return Err("Cannot rename to a path outside the project root".to_string());
        }
    }

    if new.exists() {
        return Err(format!("Already exists: {}", new_path));
    }

    std::fs::rename(&old, &new).map_err(|e| format!("Failed to rename: {}", e))?;

    Ok(())
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
