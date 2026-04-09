import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/stores/useSessionStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface DirEntry {
  name: string;
  isDir: boolean;
  extension: string;
}

interface TreeNodeState {
  expanded: boolean;
  children: DirEntry[] | null;
  loading: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

async function listDirectory(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_directory", { path });
}

function FileIcon({ extension }: { extension: string }) {
  const codeExts = new Set(["ts", "tsx", "js", "jsx", "rs", "py", "go", "java", "c", "cpp", "h"]);
  const docExts = new Set(["md", "txt", "json", "yaml", "yml", "toml", "xml", "html", "css"]);

  if (codeExts.has(extension)) {
    return <FileText size={14} className="shrink-0 text-maestro-accent" />;
  }
  if (docExts.has(extension)) {
    return <FileText size={14} className="shrink-0 text-maestro-muted" />;
  }
  return <File size={14} className="shrink-0 text-maestro-muted/70" />;
}

function FileTreeNode({
  entry,
  parentPath,
  depth,
  onOpenFile,
  onContextMenu,
}: {
  entry: DirEntry;
  parentPath: string;
  depth: number;
  onOpenFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
}) {
  const fullPath = `${parentPath}/${entry.name}`;
  const [state, setState] = useState<TreeNodeState>({
    expanded: false,
    children: null,
    loading: false,
  });

  const toggleExpand = useCallback(async () => {
    if (!entry.isDir) return;

    if (state.expanded) {
      setState((s) => ({ ...s, expanded: false }));
      return;
    }

    if (state.children === null) {
      setState((s) => ({ ...s, loading: true }));
      try {
        const children = await listDirectory(fullPath);
        setState({ expanded: true, children, loading: false });
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    } else {
      setState((s) => ({ ...s, expanded: true }));
    }
  }, [entry.isDir, fullPath, state.expanded, state.children]);

  const handleDoubleClick = useCallback(() => {
    if (!entry.isDir) {
      onOpenFile(fullPath);
    }
  }, [entry.isDir, fullPath, onOpenFile]);

  const handleCtxMenu = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu(e, fullPath, entry.isDir);
    },
    [fullPath, entry.isDir, onContextMenu],
  );

  return (
    <div>
      <button
        type="button"
        onClick={entry.isDir ? toggleExpand : undefined}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleCtxMenu}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-maestro-border/30"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {entry.isDir ? (
          <>
            {state.loading ? (
              <Loader2 size={12} className="shrink-0 animate-spin text-maestro-muted" />
            ) : state.expanded ? (
              <ChevronDown size={12} className="shrink-0 text-maestro-muted" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-maestro-muted" />
            )}
            {state.expanded ? (
              <FolderOpen size={14} className="shrink-0 text-maestro-accent" />
            ) : (
              <Folder size={14} className="shrink-0 text-maestro-accent/70" />
            )}
          </>
        ) : (
          <>
            <span className="inline-block w-3 shrink-0" />
            <FileIcon extension={entry.extension} />
          </>
        )}
        <span className="truncate text-maestro-text">{entry.name}</span>
      </button>
      {state.expanded && state.children && (
        <div>
          {state.children.map((child) => (
            <FileTreeNode
              key={child.name}
              entry={child}
              parentPath={fullPath}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.active);
  const projectPath = activeTab?.projectPath ?? "";
  const sessions = useSessionStore((s) => s.sessions);

  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  // Load root directory
  useEffect(() => {
    if (!projectPath) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    listDirectory(projectPath)
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectPath]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxMenuRef.current && ctxMenuRef.current.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

  const handleOpenFile = useCallback(
    async (path: string) => {
      // Check for existing file session
      const existing = sessions.find((s) => s.kind === "OpenFile" && s.file_path === path);
      if (existing) {
        useSessionStore.getState().setFocusedSessionId(existing.id);
        return;
      }
      // Create new file session
      try {
        await invoke("create_file_session", {
          projectPath,
          filePath: path,
        });
      } catch (e) {
        console.error("Failed to open file session:", e);
      }
    },
    [projectPath, sessions],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCtxMenu(null);
  }, []);

  if (!projectPath) {
    return (
      <div className="px-2 py-4 text-center text-xs text-maestro-muted">No project selected</div>
    );
  }

  return (
    <div className="space-y-1">
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-maestro-muted" />
        </div>
      ) : error ? (
        <div className="px-2 py-2 text-xs text-red-400">{error}</div>
      ) : entries.length === 0 ? (
        <div className="px-2 py-2 text-xs text-maestro-muted">Empty directory</div>
      ) : (
        entries.map((entry) => (
          <FileTreeNode
            key={entry.name}
            entry={entry}
            parentPath={projectPath}
            depth={0}
            onOpenFile={handleOpenFile}
            onContextMenu={handleContextMenu}
          />
        ))
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[160px] rounded border border-maestro-border bg-maestro-card py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {!ctxMenu.isDir && (
            <button
              type="button"
              onClick={() => {
                handleOpenFile(ctxMenu.path);
                setCtxMenu(null);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
            >
              <FileText size={12} />
              Open as file session
            </button>
          )}
          <button
            type="button"
            onClick={() => copyToClipboard(ctxMenu.path)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
          >
            <Copy size={12} />
            Copy path
          </button>
          <button
            type="button"
            onClick={() => {
              const relative = ctxMenu.path.startsWith(projectPath)
                ? ctxMenu.path.slice(projectPath.length + 1)
                : ctxMenu.path;
              copyToClipboard(relative);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
          >
            <Copy size={12} />
            Copy relative path
          </button>
        </div>
      )}
    </div>
  );
}
