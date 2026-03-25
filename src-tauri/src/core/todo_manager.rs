//! Per-project to-do list manager with disk persistence.
//!
//! Stores todo items keyed by project path, persists to a JSON file
//! in the Tauri app data directory.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// A single to-do item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub order: i32,
}

/// Manages per-project to-do lists with disk persistence.
pub struct TodoManager {
    todos: RwLock<HashMap<String, Vec<TodoItem>>>,
    data_file: PathBuf,
}

impl TodoManager {
    /// Create a new TodoManager, loading existing data from disk.
    pub fn new(app_data_dir: PathBuf) -> Self {
        let data_file = app_data_dir.join("todos.json");
        let todos = if data_file.exists() {
            match std::fs::read_to_string(&data_file) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(e) => {
                    log::error!("Failed to read todos.json: {}", e);
                    HashMap::new()
                }
            }
        } else {
            HashMap::new()
        };

        Self {
            todos: RwLock::new(todos),
            data_file,
        }
    }

    /// List todos for a project, sorted: unchecked by order, then checked by completed_at desc.
    pub async fn list(&self, project_path: &str) -> Vec<TodoItem> {
        let todos = self.todos.read().await;
        let mut items = todos.get(project_path).cloned().unwrap_or_default();

        items.sort_by(|a, b| {
            match (a.completed, b.completed) {
                (false, true) => std::cmp::Ordering::Less,
                (true, false) => std::cmp::Ordering::Greater,
                (false, false) => a.order.cmp(&b.order),
                (true, true) => {
                    // Most recently completed first
                    b.completed_at.unwrap_or(0).cmp(&a.completed_at.unwrap_or(0))
                }
            }
        });

        items
    }

    /// Add a new todo item. Returns the created item.
    pub async fn add(&self, project_path: &str, text: String) -> Result<TodoItem, String> {
        let mut todos = self.todos.write().await;
        let items = todos.entry(project_path.to_string()).or_default();

        let max_order = items.iter().filter(|i| !i.completed).map(|i| i.order).max().unwrap_or(-1);

        let item = TodoItem {
            id: uuid::Uuid::new_v4().to_string(),
            text,
            completed: false,
            created_at: chrono::Utc::now().timestamp_millis(),
            completed_at: None,
            order: max_order + 1,
        };

        items.push(item.clone());
        self.save_locked(&todos)?;
        Ok(item)
    }

    /// Update a todo item's text and/or completion state. Returns the updated item.
    pub async fn update(
        &self,
        project_path: &str,
        id: &str,
        text: Option<String>,
        completed: Option<bool>,
    ) -> Result<TodoItem, String> {
        let mut todos = self.todos.write().await;
        let items = todos.get_mut(project_path).ok_or("Project not found")?;
        let item = items.iter_mut().find(|i| i.id == id).ok_or("Todo not found")?;

        if let Some(text) = text {
            item.text = text;
        }
        if let Some(completed) = completed {
            if completed && !item.completed {
                item.completed = true;
                item.completed_at = Some(chrono::Utc::now().timestamp_millis());
            } else if !completed && item.completed {
                item.completed = false;
                item.completed_at = None;
            }
        }

        let updated = item.clone();
        self.save_locked(&todos)?;
        Ok(updated)
    }

    /// Remove a todo item.
    pub async fn remove(&self, project_path: &str, id: &str) -> Result<(), String> {
        let mut todos = self.todos.write().await;
        let items = todos.get_mut(project_path).ok_or("Project not found")?;
        let len_before = items.len();
        items.retain(|i| i.id != id);
        if items.len() == len_before {
            return Err("Todo not found".to_string());
        }
        self.save_locked(&todos)?;
        Ok(())
    }

    /// Reorder unchecked items by providing the desired order of item IDs.
    pub async fn reorder(&self, project_path: &str, item_ids: Vec<String>) -> Result<(), String> {
        let mut todos = self.todos.write().await;
        let items = todos.get_mut(project_path).ok_or("Project not found")?;

        for (order, id) in item_ids.iter().enumerate() {
            if let Some(item) = items.iter_mut().find(|i| i.id == *id && !i.completed) {
                item.order = order as i32;
            }
        }

        self.save_locked(&todos)?;
        Ok(())
    }

    /// Save to disk while holding the write lock.
    fn save_locked(&self, todos: &HashMap<String, Vec<TodoItem>>) -> Result<(), String> {
        // Ensure parent directory exists
        if let Some(parent) = self.data_file.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create data directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(todos)
            .map_err(|e| format!("Failed to serialize todos: {}", e))?;
        std::fs::write(&self.data_file, content)
            .map_err(|e| format!("Failed to write todos.json: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_add_and_list() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TodoManager::new(dir.path().to_path_buf());

        let item = mgr.add("/test/project", "First task".into()).await.unwrap();
        assert_eq!(item.text, "First task");
        assert!(!item.completed);
        assert_eq!(item.order, 0);

        let items = mgr.list("/test/project").await;
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, item.id);
    }

    #[tokio::test]
    async fn test_complete_sorts_to_bottom() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TodoManager::new(dir.path().to_path_buf());

        let a = mgr.add("/p", "A".into()).await.unwrap();
        let _b = mgr.add("/p", "B".into()).await.unwrap();

        mgr.update("/p", &a.id, None, Some(true)).await.unwrap();

        let items = mgr.list("/p").await;
        assert_eq!(items[0].text, "B"); // unchecked first
        assert_eq!(items[1].text, "A"); // checked last
        assert!(items[1].completed);
        assert!(items[1].completed_at.is_some());
    }

    #[tokio::test]
    async fn test_uncomplete_restores() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TodoManager::new(dir.path().to_path_buf());

        let item = mgr.add("/p", "Task".into()).await.unwrap();
        mgr.update("/p", &item.id, None, Some(true)).await.unwrap();
        let updated = mgr.update("/p", &item.id, None, Some(false)).await.unwrap();

        assert!(!updated.completed);
        assert!(updated.completed_at.is_none());
    }

    #[tokio::test]
    async fn test_remove() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TodoManager::new(dir.path().to_path_buf());

        let item = mgr.add("/p", "Task".into()).await.unwrap();
        mgr.remove("/p", &item.id).await.unwrap();

        let items = mgr.list("/p").await;
        assert!(items.is_empty());
    }

    #[tokio::test]
    async fn test_reorder() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TodoManager::new(dir.path().to_path_buf());

        let a = mgr.add("/p", "A".into()).await.unwrap();
        let b = mgr.add("/p", "B".into()).await.unwrap();
        let c = mgr.add("/p", "C".into()).await.unwrap();

        // Reorder to C, A, B
        mgr.reorder("/p", vec![c.id.clone(), a.id.clone(), b.id.clone()])
            .await
            .unwrap();

        let items = mgr.list("/p").await;
        assert_eq!(items[0].text, "C");
        assert_eq!(items[1].text, "A");
        assert_eq!(items[2].text, "B");
    }

    #[tokio::test]
    async fn test_per_project_isolation() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TodoManager::new(dir.path().to_path_buf());

        mgr.add("/project1", "P1 task".into()).await.unwrap();
        mgr.add("/project2", "P2 task".into()).await.unwrap();

        let p1 = mgr.list("/project1").await;
        let p2 = mgr.list("/project2").await;
        assert_eq!(p1.len(), 1);
        assert_eq!(p2.len(), 1);
        assert_eq!(p1[0].text, "P1 task");
        assert_eq!(p2[0].text, "P2 task");
    }

    #[tokio::test]
    async fn test_persistence_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_path_buf();

        {
            let mgr = TodoManager::new(path.clone());
            mgr.add("/p", "Persisted".into()).await.unwrap();
        }

        // Load from same directory
        let mgr2 = TodoManager::new(path);
        let items = mgr2.list("/p").await;
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].text, "Persisted");
    }
}
