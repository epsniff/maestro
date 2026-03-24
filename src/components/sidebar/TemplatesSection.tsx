import {
  BookTemplate,
  Bot,
  ChevronDown,
  ChevronRight,
  Cpu,
  Globe,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { OpenCodeIcon } from "@/components/icons/OpenCodeIcon";
import type { AiMode } from "@/stores/useSessionStore";
import { useTemplateStore } from "@/stores/useTemplateStore";
import { cardClass } from "./Sidebar";

const MODE_ICON: Record<AiMode, React.ElementType> = {
  Claude: Bot,
  Gemini: Sparkles,
  Codex: Cpu,
  OpenCode: OpenCodeIcon,
  Plain: Globe,
};

const MODE_COLOR: Record<AiMode, string> = {
  Claude: "text-violet-500",
  Gemini: "text-blue-400",
  Codex: "text-green-400",
  OpenCode: "text-purple-500",
  Plain: "text-maestro-muted",
};

export function TemplatesSection() {
  const [expanded, setExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const templates = useTemplateStore((s) => s.templates);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const updateTemplate = useTemplateStore((s) => s.updateTemplate);
  const setPendingTemplate = useTemplateStore((s) => s.setPendingTemplate);

  const sorted = useMemo(
    () => [...templates].sort((a, b) => a.sortOrder - b.sortOrder),
    [templates],
  );

  const commitRename = useCallback(
    (id: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) updateTemplate(id, { name: trimmed });
      setEditingId(null);
    },
    [updateTemplate],
  );

  const cancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  return (
    <div className={cardClass}>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-maestro-muted">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 hover:text-maestro-text"
        >
          {expanded ? (
            <ChevronDown size={13} className="text-maestro-muted/80" />
          ) : (
            <ChevronRight size={13} className="text-maestro-muted/80" />
          )}
        </button>
        <BookTemplate size={13} className="text-maestro-orange" />
        <span className="flex-1">Templates</span>
        {templates.length > 0 && (
          <span className="bg-maestro-orange/20 text-maestro-orange text-[10px] px-1.5 rounded-full font-bold">
            {templates.length}
          </span>
        )}
      </div>

      {expanded && (
        <div className="space-y-0.5">
          {sorted.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-maestro-muted/60">No templates saved</div>
          ) : (
            sorted.map((t) => {
              const ModeIcon = MODE_ICON[t.mode];
              return (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 rounded-md px-2 py-1 text-xs text-maestro-text hover:bg-maestro-border/40"
                >
                  <button
                    type="button"
                    title={`${t.mode} — ${t.enabledMcpServers.length} MCPs, ${t.enabledPlugins.length} plugins, ${t.enabledSkills.length} skills`}
                    className="flex flex-1 items-center gap-2 cursor-pointer text-left min-w-0"
                    onClick={() => {
                      if (editingId !== t.id) setPendingTemplate(t);
                    }}
                  >
                    <ModeIcon size={12} className={`${MODE_COLOR[t.mode]} shrink-0`} />
                    {editingId === t.id ? (
                      <input
                        // biome-ignore lint/a11y/noAutofocus: inline rename needs immediate focus
                        autoFocus
                        maxLength={50}
                        className="flex-1 bg-maestro-bg border border-maestro-border rounded px-1 py-0 text-xs font-medium text-maestro-text outline-none focus:border-maestro-accent"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(t.id, editValue);
                          if (e.key === "Escape") cancelRename();
                        }}
                        onBlur={() => commitRename(t.id, editValue)}
                      />
                    ) : (
                      <span
                        className="flex-1 font-medium truncate"
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingId(t.id);
                          setEditValue(t.name);
                        }}
                      >
                        {t.name}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="hidden group-hover:flex items-center rounded p-0.5 hover:bg-maestro-red/20"
                    onClick={() => deleteTemplate(t.id)}
                  >
                    <Trash2 size={12} className="text-maestro-red" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
