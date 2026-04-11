import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Trash2,
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

/** Names hidden by default (must match backend HIDDEN_NAMES for dimming). */
const HIDDEN_NAMES = new Set([
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
]);

function isHiddenEntry(name: string): boolean {
  return name.startsWith(".") || HIDDEN_NAMES.has(name);
}

async function listDirectory(path: string, showHidden = false): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_directory", { path, showHidden });
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
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  showHidden,
  onDragStart,
  onDrop,
  dropTargetPath,
}: {
  entry: DirEntry;
  parentPath: string;
  depth: number;
  onOpenFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  renamingPath: string | null;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
  showHidden: boolean;
  onDragStart: (path: string) => void;
  onDrop: (targetFolderPath: string) => void;
  dropTargetPath: string | null;
}) {
  const fullPath = `${parentPath}/${entry.name}`;
  const isRenaming = renamingPath === fullPath;
  const [renameValue, setRenameValue] = useState(entry.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<TreeNodeState>({
    expanded: false,
    children: null,
    loading: false,
  });

  // Focus rename input when it appears
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select filename without extension for files
      const dotIdx = entry.name.lastIndexOf(".");
      if (!entry.isDir && dotIdx > 0) {
        renameInputRef.current.setSelectionRange(0, dotIdx);
      } else {
        renameInputRef.current.select();
      }
    }
  }, [isRenaming, entry.name, entry.isDir]);

  const toggleExpand = useCallback(async () => {
    if (!entry.isDir) return;

    if (state.expanded) {
      setState((s) => ({ ...s, expanded: false }));
      return;
    }

    if (state.children === null) {
      setState((s) => ({ ...s, loading: true }));
      try {
        const children = await listDirectory(fullPath, showHidden);
        setState({ expanded: true, children, loading: false });
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    } else {
      setState((s) => ({ ...s, expanded: true }));
    }
  }, [entry.isDir, fullPath, state.expanded, state.children, showHidden]);

  // Re-fetch children when showHidden changes
  useEffect(() => {
    if (state.children !== null) {
      setState((s) => ({ ...s, children: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden]);

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

  const hidden = isHiddenEntry(entry.name);

  return (
    <div>
      <button
        type="button"
        draggable={!isRenaming}
        data-folder-path={entry.isDir ? fullPath : undefined}
        onClick={entry.isDir ? toggleExpand : undefined}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleCtxMenu}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", fullPath);
          onDragStart(fullPath);
        }}
        onDragOver={(e) => {
          if (entry.isDir) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (entry.isDir) {
            onDrop(fullPath);
          }
        }}
        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-maestro-border/30${hidden ? " opacity-50" : ""}${dropTargetPath === fullPath ? " bg-maestro-accent/20 ring-1 ring-maestro-accent/50" : ""}`}
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
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                const trimmed = renameValue.trim();
                if (trimmed && trimmed !== entry.name) {
                  onRenameSubmit(fullPath, trimmed);
                } else {
                  onRenameCancel();
                }
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                onRenameCancel();
              }
            }}
            onBlur={() => {
              const trimmed = renameValue.trim();
              if (trimmed && trimmed !== entry.name) {
                onRenameSubmit(fullPath, trimmed);
              } else {
                onRenameCancel();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded border border-maestro-accent bg-maestro-bg px-1 text-xs text-maestro-text outline-none"
          />
        ) : (
          <span className="truncate text-maestro-text">{entry.name}</span>
        )}
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
              renamingPath={renamingPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              showHidden={showHidden}
              onDragStart={onDragStart}
              onDrop={onDrop}
              dropTargetPath={dropTargetPath}
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
  const [showHidden, setShowHidden] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [newFileDir, setNewFileDir] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const [newFolderDir, setNewFolderDir] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  // Load root directory
  useEffect(() => {
    if (!projectPath) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    listDirectory(projectPath, showHidden)
      .then(setEntries)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectPath, showHidden]);

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

  const refreshRoot = useCallback(() => {
    if (!projectPath) return;
    listDirectory(projectPath, showHidden)
      .then(setEntries)
      .catch(() => {});
  }, [projectPath, showHidden]);

  // Focus the new file input when it appears
  useEffect(() => {
    if (newFileDir && newFileInputRef.current) {
      newFileInputRef.current.focus();
    }
  }, [newFileDir]);

  // Focus the new folder input when it appears
  useEffect(() => {
    if (newFolderDir && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [newFolderDir]);

  const handleNewFile = useCallback((ctxPath: string, isDir: boolean) => {
    const dir = isDir ? ctxPath : ctxPath.substring(0, ctxPath.lastIndexOf("/"));
    setNewFileDir(dir);
    setNewFileName("");
    setNewFileError(null);
    setCtxMenu(null);
  }, []);

  const submitNewFile = useCallback(async () => {
    if (!newFileDir || !newFileName.trim()) return;
    const fullPath = `${newFileDir}/${newFileName.trim()}`;
    try {
      await invoke("create_file", { path: fullPath });
      setNewFileDir(null);
      setNewFileName("");
      setNewFileError(null);
      refreshRoot();
    } catch (e) {
      setNewFileError(String(e));
    }
  }, [newFileDir, newFileName, refreshRoot]);

  const cancelNewFile = useCallback(() => {
    setNewFileDir(null);
    setNewFileName("");
    setNewFileError(null);
  }, []);

  const handleNewFolder = useCallback((ctxPath: string, isDir: boolean) => {
    const dir = isDir ? ctxPath : ctxPath.substring(0, ctxPath.lastIndexOf("/"));
    setNewFolderDir(dir);
    setNewFolderName("");
    setNewFolderError(null);
    setCtxMenu(null);
  }, []);

  const submitNewFolder = useCallback(async () => {
    if (!newFolderDir || !newFolderName.trim()) return;
    const fullPath = `${newFolderDir}/${newFolderName.trim()}`;
    try {
      await invoke("create_directory", { path: fullPath, projectRoot: projectPath });
      setNewFolderDir(null);
      setNewFolderName("");
      setNewFolderError(null);
      refreshRoot();
    } catch (e) {
      setNewFolderError(String(e));
    }
  }, [newFolderDir, newFolderName, projectPath, refreshRoot]);

  const cancelNewFolder = useCallback(() => {
    setNewFolderDir(null);
    setNewFolderName("");
    setNewFolderError(null);
  }, []);

  const handleOpenFile = useCallback(
    (path: string) => {
      if (!projectPath) return;
      // Check for existing file session — focus it rather than creating a new slot.
      const existing = sessions.find((s) => s.kind === "OpenFile" && s.file_path === path);
      if (existing) {
        useSessionStore.getState().setFocusedSessionId(existing.id);
        return;
      }
      // Ensure TerminalGrid is mounted — it only renders when sessionsLaunched is true.
      // Without this, the pendingFileOpen signal has no consumer.
      if (activeTab && !activeTab.sessionsLaunched) {
        useWorkspaceStore.getState().setSessionsLaunched(activeTab.id, true);
      }
      // Signal TerminalGrid (via the session store) to create a new OpenFile slot
      // and launch it. TerminalGrid watches `pendingFileOpen` in a useEffect.
      useSessionStore.getState().setPendingFileOpen({ projectPath, filePath: path });
    },
    [projectPath, sessions, activeTab],
  );

  const handleDelete = useCallback(
    async (path: string, isDir: boolean) => {
      const name = path.split("/").pop() ?? path;
      const kind = isDir ? "folder" : "file";
      setCtxMenu(null);
      const confirmed = await ask(`Delete ${kind} "${name}"? This cannot be undone.`, {
        title: "Confirm Delete",
        kind: "warning",
      });
      if (!confirmed) return;
      try {
        await invoke("delete_path", { path, projectRoot: projectPath });
        refreshRoot();
      } catch (e) {
        console.error("Failed to delete:", e);
      }
    },
    [projectPath, refreshRoot],
  );

  const handleStartRename = useCallback((path: string) => {
    setRenamingPath(path);
    setCtxMenu(null);
  }, []);

  const handleRenameSubmit = useCallback(
    async (oldPath: string, newName: string) => {
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newPath = `${parentDir}/${newName}`;
      try {
        await invoke("rename_path", {
          oldPath,
          newPath,
          projectRoot: projectPath,
        });
        // Update any open file sessions that reference the old path
        const allSessions = useSessionStore.getState().sessions;
        for (const s of allSessions) {
          if (s.kind === "OpenFile" && s.file_path === oldPath) {
            useSessionStore.getState().updateSession(s.id, { file_path: newPath });
          }
        }
        setRenamingPath(null);
        refreshRoot();
      } catch (e) {
        console.error("Failed to rename:", e);
        alert(`Rename failed: ${e}`);
        setRenamingPath(null);
      }
    },
    [projectPath, refreshRoot],
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handleDragStart = useCallback((path: string) => {
    setDraggedPath(path);
  }, []);

  const handleDrop = useCallback(
    async (targetFolderPath: string) => {
      setDropTargetPath(null);
      if (!draggedPath || !projectPath) {
        setDraggedPath(null);
        return;
      }
      const fileName = draggedPath.split("/").pop() ?? "";
      const sourcePar = draggedPath.substring(0, draggedPath.lastIndexOf("/"));
      // No-op if dropping into the same folder or onto itself
      if (sourcePar === targetFolderPath || draggedPath === targetFolderPath) {
        setDraggedPath(null);
        return;
      }
      // Don't allow dropping a folder into itself or its own subtree
      if (targetFolderPath.startsWith(`${draggedPath}/`)) {
        setDraggedPath(null);
        return;
      }
      const newPath = `${targetFolderPath}/${fileName}`;
      try {
        await invoke("rename_path", {
          oldPath: draggedPath,
          newPath,
          projectRoot: projectPath,
        });
        // Update open file sessions that reference the old path
        const allSessions = useSessionStore.getState().sessions;
        for (const s of allSessions) {
          if (s.kind === "OpenFile" && s.file_path?.startsWith(draggedPath)) {
            const updated = s.file_path.replace(draggedPath, newPath);
            useSessionStore.getState().updateSession(s.id, { file_path: updated });
          }
        }
        refreshRoot();
      } catch (e) {
        console.error("Failed to move:", e);
      }
      setDraggedPath(null);
    },
    [draggedPath, projectPath, refreshRoot],
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
    <div
      role="tree"
      className="space-y-1"
      onDragOver={(e) => {
        // Check if dragOver target is a folder button — if not, clear highlight
        const target = e.target as HTMLElement;
        const btn = target.closest("button[draggable]");
        if (!btn) setDropTargetPath(null);
      }}
      onDragEnter={(e) => {
        // Track which folder is being hovered via data attribute
        const target = e.target as HTMLElement;
        const btn = target.closest("button[draggable]");
        if (btn) {
          const path = btn.getAttribute("data-folder-path");
          if (path) setDropTargetPath(path);
          else setDropTargetPath(null);
        }
      }}
      onDragEnd={() => {
        setDraggedPath(null);
        setDropTargetPath(null);
      }}
      onDrop={(e) => {
        // If dropped on the container (not a folder), it's a no-op
        e.preventDefault();
        setDraggedPath(null);
        setDropTargetPath(null);
      }}
    >
      <div className="flex items-center justify-end px-2">
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
          className="rounded p-0.5 text-maestro-muted hover:bg-maestro-border/40 hover:text-maestro-text"
        >
          {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
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
            renamingPath={renamingPath}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={handleRenameCancel}
            showHidden={showHidden}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            dropTargetPath={dropTargetPath}
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
            onClick={() => handleNewFile(ctxMenu.path, ctxMenu.isDir)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
          >
            <FilePlus size={12} />
            New file
          </button>
          <button
            type="button"
            onClick={() => handleNewFolder(ctxMenu.path, ctxMenu.isDir)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
          >
            <FolderPlus size={12} />
            New folder
          </button>
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
          <button
            type="button"
            onClick={() => {
              revealItemInDir(ctxMenu.path);
              setCtxMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
          >
            <ExternalLink size={12} />
            Reveal in Finder
          </button>
          <button
            type="button"
            onClick={() => handleStartRename(ctxMenu.path)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-border/40"
          >
            <Pencil size={12} />
            Rename
          </button>
          <div className="my-1 border-t border-maestro-border" />
          <button
            type="button"
            onClick={() => handleDelete(ctxMenu.path, ctxMenu.isDir)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}

      {/* New file inline input */}
      {newFileDir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-32">
          <div className="rounded border border-maestro-border bg-maestro-card p-3 shadow-lg">
            <div className="mb-2 text-xs text-maestro-muted">
              New file in{" "}
              <span className="text-maestro-text">
                {newFileDir.startsWith(projectPath)
                  ? newFileDir.slice(projectPath.length + 1) || "/"
                  : newFileDir}
              </span>
            </div>
            <input
              ref={newFileInputRef}
              type="text"
              value={newFileName}
              onChange={(e) => {
                setNewFileName(e.target.value);
                setNewFileError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewFile();
                if (e.key === "Escape") cancelNewFile();
              }}
              placeholder="filename.ext"
              className="w-full rounded border border-maestro-border bg-maestro-bg px-2 py-1 text-xs text-maestro-text outline-none focus:border-maestro-accent"
            />
            {newFileError && <div className="mt-1 text-xs text-red-400">{newFileError}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelNewFile}
                className="rounded px-2 py-0.5 text-xs text-maestro-muted hover:bg-maestro-border/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitNewFile}
                disabled={!newFileName.trim()}
                className="rounded bg-maestro-accent px-2 py-0.5 text-xs text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New folder inline input */}
      {newFolderDir && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-32">
          <div className="rounded border border-maestro-border bg-maestro-card p-3 shadow-lg">
            <div className="mb-2 text-xs text-maestro-muted">
              New folder in{" "}
              <span className="text-maestro-text">
                {newFolderDir.startsWith(projectPath)
                  ? newFolderDir.slice(projectPath.length + 1) || "/"
                  : newFolderDir}
              </span>
            </div>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value);
                setNewFolderError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewFolder();
                if (e.key === "Escape") cancelNewFolder();
              }}
              placeholder="folder-name"
              className="w-full rounded border border-maestro-border bg-maestro-bg px-2 py-1 text-xs text-maestro-text outline-none focus:border-maestro-accent"
            />
            {newFolderError && <div className="mt-1 text-xs text-red-400">{newFolderError}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelNewFolder}
                className="rounded px-2 py-0.5 text-xs text-maestro-muted hover:bg-maestro-border/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitNewFolder}
                disabled={!newFolderName.trim()}
                className="rounded bg-maestro-accent px-2 py-0.5 text-xs text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
