//! Tauri IPC commands for managing per-project to-do lists.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::core::todo_manager::{TodoItem, TodoManager};

/// Event payload emitted when todos change.
#[derive(Debug, Clone, Serialize)]
struct TodoChangedPayload {
    project_path: String,
}

#[tauri::command]
pub async fn get_todos(
    project_path: String,
    todo_manager: State<'_, Arc<TodoManager>>,
) -> Result<Vec<TodoItem>, String> {
    Ok(todo_manager.list(&project_path).await)
}

#[tauri::command]
pub async fn add_todo(
    app: AppHandle,
    project_path: String,
    text: String,
    todo_manager: State<'_, Arc<TodoManager>>,
) -> Result<TodoItem, String> {
    let item = todo_manager.add(&project_path, text).await?;
    let _ = app.emit("todo-changed", TodoChangedPayload { project_path });
    Ok(item)
}

#[tauri::command]
pub async fn update_todo(
    app: AppHandle,
    project_path: String,
    id: String,
    text: Option<String>,
    completed: Option<bool>,
    todo_manager: State<'_, Arc<TodoManager>>,
) -> Result<TodoItem, String> {
    let item = todo_manager
        .update(&project_path, &id, text, completed)
        .await?;
    let _ = app.emit("todo-changed", TodoChangedPayload { project_path });
    Ok(item)
}

#[tauri::command]
pub async fn remove_todo(
    app: AppHandle,
    project_path: String,
    id: String,
    todo_manager: State<'_, Arc<TodoManager>>,
) -> Result<(), String> {
    todo_manager.remove(&project_path, &id).await?;
    let _ = app.emit("todo-changed", TodoChangedPayload { project_path });
    Ok(())
}

#[tauri::command]
pub async fn reorder_todos(
    app: AppHandle,
    project_path: String,
    item_ids: Vec<String>,
    todo_manager: State<'_, Arc<TodoManager>>,
) -> Result<(), String> {
    todo_manager.reorder(&project_path, item_ids).await?;
    let _ = app.emit("todo-changed", TodoChangedPayload { project_path });
    Ok(())
}
