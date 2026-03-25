import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  created_at: number;
  completed_at: number | null;
  order: number;
}

interface TodoState {
  /** Per-project todo items (projectPath -> items) */
  todos: Record<string, TodoItem[]>;
  /** Per-project loading state */
  loading: Record<string, boolean>;

  fetchTodos: (projectPath: string) => Promise<void>;
  addTodo: (projectPath: string, text: string) => Promise<TodoItem>;
  updateTodo: (
    projectPath: string,
    id: string,
    updates: { text?: string; completed?: boolean },
  ) => Promise<void>;
  removeTodo: (projectPath: string, id: string) => Promise<void>;
  reorderTodos: (projectPath: string, itemIds: string[]) => Promise<void>;
  /** Subscribe to backend todo-changed events. Returns unlisten function. */
  initListener: () => Promise<() => void>;
}

export const useTodoStore = create<TodoState>()((set, get) => ({
  todos: {},
  loading: {},

  fetchTodos: async (projectPath: string) => {
    set((state) => ({
      loading: { ...state.loading, [projectPath]: true },
    }));
    try {
      const items = await invoke<TodoItem[]>("get_todos", {
        projectPath,
      });
      set((state) => ({
        todos: { ...state.todos, [projectPath]: items },
        loading: { ...state.loading, [projectPath]: false },
      }));
    } catch (e) {
      console.error("Failed to fetch todos:", e);
      set((state) => ({
        loading: { ...state.loading, [projectPath]: false },
      }));
    }
  },

  addTodo: async (projectPath: string, text: string) => {
    const item = await invoke<TodoItem>("add_todo", {
      projectPath,
      text,
    });
    // Optimistically add to local state
    set((state) => ({
      todos: {
        ...state.todos,
        [projectPath]: [...(state.todos[projectPath] || []), item],
      },
    }));
    return item;
  },

  updateTodo: async (
    projectPath: string,
    id: string,
    updates: { text?: string; completed?: boolean },
  ) => {
    await invoke<TodoItem>("update_todo", {
      projectPath,
      id,
      text: updates.text ?? null,
      completed: updates.completed ?? null,
    });
    // Refetch to get correct sort order
    await get().fetchTodos(projectPath);
  },

  removeTodo: async (projectPath: string, id: string) => {
    await invoke("remove_todo", { projectPath, id });
    set((state) => ({
      todos: {
        ...state.todos,
        [projectPath]: (state.todos[projectPath] || []).filter((t) => t.id !== id),
      },
    }));
  },

  reorderTodos: async (projectPath: string, itemIds: string[]) => {
    await invoke("reorder_todos", { projectPath, itemIds });
    await get().fetchTodos(projectPath);
  },

  initListener: async () => {
    const unlisten = await listen<{ project_path: string }>("todo-changed", (event) => {
      get().fetchTodos(event.payload.project_path);
    });
    return unlisten;
  },
}));
