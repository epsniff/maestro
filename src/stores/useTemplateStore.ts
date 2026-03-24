import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AiMode } from "@/stores/useSessionStore";
import type { SessionTemplate } from "@/types/sessionTemplate";

// --- Tauri LazyStore-backed StateStorage adapter ---

const lazyStore = new LazyStore("session-templates.json");

const tauriStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await lazyStore.get<string>(name);
      return value ?? null;
    } catch (err) {
      console.error(`tauriStorage.getItem("${name}") failed:`, err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await lazyStore.set(name, value);
      await lazyStore.save();
    } catch (err) {
      console.error(`tauriStorage.setItem("${name}") failed:`, err);
      throw err;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await lazyStore.delete(name);
      await lazyStore.save();
    } catch (err) {
      console.error(`tauriStorage.removeItem("${name}") failed:`, err);
      throw err;
    }
  },
};

// --- Store Types ---

type TemplateState = {
  templates: SessionTemplate[];
  /** Transient: set by sidebar, consumed by TerminalGrid to apply a template to a slot. */
  pendingTemplate: SessionTemplate | null;
};

type TemplateActions = {
  addTemplate: (data: {
    name: string;
    mode: AiMode;
    enabledMcpServers: string[];
    enabledSkills: string[];
    enabledPlugins: string[];
  }) => void;
  updateTemplate: (id: string, updates: Partial<Omit<SessionTemplate, "id" | "createdAt">>) => void;
  deleteTemplate: (id: string) => void;
  setPendingTemplate: (template: SessionTemplate) => void;
  clearPendingTemplate: () => void;
};

// --- Store ---

export const useTemplateStore = create<TemplateState & TemplateActions>()(
  persist(
    (set, get) => ({
      templates: [],
      pendingTemplate: null,

      addTemplate: (data) => {
        const { templates } = get();
        const maxSortOrder =
          templates.length > 0 ? Math.max(...templates.map((t) => t.sortOrder)) : -1;

        const newTemplate: SessionTemplate = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          sortOrder: maxSortOrder + 1,
          ...data,
        };

        set({ templates: [...templates, newTemplate] });
      },

      updateTemplate: (id, updates) => {
        set({
          templates: get().templates.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        });
      },

      deleteTemplate: (id) => {
        const remaining = get().templates.filter((t) => t.id !== id);
        const normalized = remaining
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((t, index) => ({ ...t, sortOrder: index }));
        set({ templates: normalized });
      },

      setPendingTemplate: (template) => {
        set({ pendingTemplate: template });
      },

      clearPendingTemplate: () => {
        set({ pendingTemplate: null });
      },
    }),
    {
      name: "maestro-session-templates",
      storage: createJSONStorage(() => tauriStorage),
      partialize: (state) => ({ templates: state.templates }),
      version: 1,
    },
  ),
);
