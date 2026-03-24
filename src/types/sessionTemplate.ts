import type { AiMode } from "@/stores/useSessionStore";

/** A saved session configuration template that can be reused when creating new sessions. */
export interface SessionTemplate {
  id: string;
  name: string;
  mode: AiMode;
  enabledMcpServers: string[];
  enabledSkills: string[];
  enabledPlugins: string[];
  createdAt: string;
  sortOrder: number;
}
