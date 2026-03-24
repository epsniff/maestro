import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  FolderOpen,
  GitFork,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanupSessionWorktree, listWorktrees, type WorktreeInfo } from "@/lib/worktreeManager";
import { type SessionConfig, useSessionStore } from "@/stores/useSessionStore";

/** Status dot color classes matching StatusLegend.tsx STATUS_DEFS. */
const STATUS_COLOR_MAP: Record<string, string> = {
  Starting: "bg-orange-400",
  Idle: "bg-maestro-muted",
  Working: "bg-maestro-accent",
  NeedsInput: "bg-yellow-300",
  Done: "bg-maestro-green",
  Error: "bg-red-400",
  Timeout: "bg-red-400",
};

interface WorktreeCardProps {
  repoPath: string;
  isVisible: boolean;
  onFocusSession: (sessionId: number) => void;
  onLaunchSession: (branch: string, worktreePath: string) => void;
}

interface WorktreeRow {
  worktree: WorktreeInfo;
  session: SessionConfig | null;
  isOrphaned: boolean;
}

export function WorktreeCard({
  repoPath,
  isVisible,
  onFocusSession,
  onLaunchSession,
}: WorktreeCardProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const sessions = useSessionStore((s) => s.sessions);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWorktrees = useCallback(async () => {
    try {
      const result = await listWorktrees(repoPath);
      setWorktrees(result);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  // Fetch on mount and poll every 5s while visible
  useEffect(() => {
    if (!isVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setIsLoading(true);
    fetchWorktrees();
    intervalRef.current = setInterval(fetchWorktrees, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isVisible, fetchWorktrees]);

  // Refresh immediately when sessions change
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    if (sessions !== sessionsRef.current) {
      sessionsRef.current = sessions;
      if (isVisible) fetchWorktrees();
    }
  }, [sessions, isVisible, fetchWorktrees]);

  // Build rows: cross-reference worktrees with sessions
  const rows: WorktreeRow[] = worktrees.map((wt) => {
    let session: SessionConfig | null = null;
    if (wt.is_main_worktree) {
      // Main worktree: match sessions with null worktree_path whose project_path matches
      session = sessions.find((s) => s.project_path === repoPath && !s.worktree_path) ?? null;
    } else {
      session = sessions.find((s) => s.worktree_path === wt.path) ?? null;
    }
    return {
      worktree: wt,
      session,
      isOrphaned: !session && !wt.is_main_worktree,
    };
  });

  // Sort: main first, then active (by session ID), then orphaned (alpha by branch)
  rows.sort((a, b) => {
    if (a.worktree.is_main_worktree) return -1;
    if (b.worktree.is_main_worktree) return 1;
    if (a.session && !b.session) return -1;
    if (!a.session && b.session) return 1;
    if (a.session && b.session) return a.session.id - b.session.id;
    // Both orphaned — sort alphabetically by branch
    const aName = a.worktree.branch ?? a.worktree.head;
    const bName = b.worktree.branch ?? b.worktree.head;
    return aName.localeCompare(bName);
  });

  const handleDelete = useCallback(
    async (wt: WorktreeInfo) => {
      const proceed = window.confirm(
        `Delete worktree for branch "${wt.branch ?? wt.head.slice(0, 8)}"?\n\nThis will remove the directory at:\n${wt.path}`,
      );
      if (!proceed) return;

      setDeletingPath(wt.path);
      try {
        await cleanupSessionWorktree(repoPath, wt.path);
        await fetchWorktrees();
        if (expandedPath === wt.path) setExpandedPath(null);
      } catch (err) {
        console.error("Failed to delete worktree:", err);
        window.alert(`Failed to delete worktree: ${err}`);
      } finally {
        setDeletingPath(null);
      }
    },
    [repoPath, fetchWorktrees, expandedPath],
  );

  const handleOpenInFinder = useCallback(async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (err) {
      console.error("Failed to open in finder:", err);
    }
  }, []);

  const cardClass =
    "sidebar-card-link rounded-lg border border-maestro-border/60 bg-maestro-card p-3 overflow-hidden shadow-[0_1px_4px_rgb(0_0_0/0.15),0_0_0_1px_rgb(255_255_255/0.03)_inset] transition-shadow hover:shadow-[0_2px_8px_rgb(0_0_0/0.25),0_0_0_1px_rgb(255_255_255/0.05)_inset]";

  if (error && worktrees.length === 0) {
    return (
      <div className={cardClass}>
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-maestro-muted">
          <GitFork size={13} className="text-maestro-accent" />
          <span className="flex-1">Worktrees</span>
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="flex-1 text-[11px] text-red-400">Failed to load worktrees</span>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              fetchWorktrees();
            }}
            className="rounded px-2 py-0.5 text-[10px] text-maestro-muted transition-colors hover:bg-maestro-border/40 hover:text-maestro-text"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-maestro-muted">
        <GitFork size={13} className="text-maestro-accent" />
        <span className="flex-1">Worktrees</span>
        {isLoading && <Loader2 size={11} className="animate-spin text-maestro-muted" />}
        <span className="rounded-full bg-maestro-accent/15 px-1.5 py-px text-[10px] font-medium text-maestro-accent">
          {worktrees.length}
        </span>
      </div>

      {worktrees.length === 0 && !isLoading ? (
        <p className="px-1 text-[11px] text-maestro-muted">No worktrees</p>
      ) : (
        <div className="space-y-px">
          {rows.map((row) => (
            <WorktreeRow
              key={row.worktree.path}
              row={row}
              isExpanded={expandedPath === row.worktree.path}
              isDeleting={deletingPath === row.worktree.path}
              onToggle={() =>
                setExpandedPath(expandedPath === row.worktree.path ? null : row.worktree.path)
              }
              onFocusSession={onFocusSession}
              onLaunchSession={onLaunchSession}
              onOpenInFinder={handleOpenInFinder}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorktreeRow({
  row,
  isExpanded,
  isDeleting,
  onToggle,
  onFocusSession,
  onLaunchSession,
  onOpenInFinder,
  onDelete,
}: {
  row: WorktreeRow;
  isExpanded: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onFocusSession: (sessionId: number) => void;
  onLaunchSession: (branch: string, worktreePath: string) => void;
  onOpenInFinder: (path: string) => void;
  onDelete: (wt: WorktreeInfo) => void;
}) {
  const { worktree, session, isOrphaned } = row;
  const branchLabel = worktree.branch ?? worktree.head.slice(0, 8);
  const statusColor = session ? (STATUS_COLOR_MAP[session.status] ?? "bg-gray-400") : "bg-gray-400";
  const sessionLabel = session?.name ?? (session ? `Session ${session.id}` : null);

  return (
    <div className="rounded transition-colors hover:bg-maestro-surface/50">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-left"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
        <span
          className={`flex-1 truncate text-[11px] font-medium ${
            isOrphaned
              ? "text-maestro-text/40"
              : worktree.is_main_worktree
                ? "text-maestro-text/60"
                : "text-maestro-text"
          }`}
        >
          {branchLabel}
          {worktree.is_main_worktree && <span className="ml-1 text-maestro-muted/50">(repo)</span>}
        </span>
        {isOrphaned ? (
          <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase text-red-400">
            orphaned
          </span>
        ) : sessionLabel ? (
          <span className="shrink-0 truncate text-[10px] text-maestro-muted max-w-[100px]">
            {sessionLabel}
          </span>
        ) : null}
        {isExpanded ? (
          <ChevronUp size={11} className="shrink-0 text-maestro-muted" />
        ) : (
          <ChevronDown size={11} className="shrink-0 text-maestro-muted" />
        )}
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="pb-2 pl-5 pr-1">
          <p className="mb-1.5 truncate text-[10px] text-maestro-muted/60" title={worktree.path}>
            {worktree.path}
          </p>

          {session && (
            <p className="mb-1.5 text-[10px] text-maestro-muted">
              {session.mode} &middot; {session.status}
              {session.statusMessage && (
                <span className="ml-1 text-maestro-muted/50">— {session.statusMessage}</span>
              )}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {/* Focus Session — for active worktrees */}
            {session && (
              <ActionButton
                icon={<Eye size={10} />}
                label="Focus"
                color="blue"
                onClick={() => onFocusSession(session.id)}
              />
            )}

            {/* Launch Session — for orphaned worktrees */}
            {isOrphaned && worktree.branch != null && (
              <ActionButton
                icon={<Play size={10} />}
                label="Launch"
                color="green"
                onClick={() => onLaunchSession(worktree.branch as string, worktree.path)}
              />
            )}

            {/* Open in Finder — always */}
            <ActionButton
              icon={<FolderOpen size={10} />}
              label="Open"
              color="neutral"
              onClick={() => onOpenInFinder(worktree.path)}
            />

            {/* Delete — only for orphaned worktrees */}
            {isOrphaned && (
              <ActionButton
                icon={
                  isDeleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />
                }
                label="Delete"
                color="red"
                disabled={isDeleting}
                onClick={() => onDelete(worktree)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  color,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: "blue" | "green" | "red" | "neutral";
  disabled?: boolean;
  onClick: () => void;
}) {
  const colorClasses = {
    blue: "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25",
    green: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25",
    red: "bg-red-500/15 text-red-400 hover:bg-red-500/25",
    neutral:
      "bg-maestro-border/40 text-maestro-muted hover:bg-maestro-border/60 hover:text-maestro-text",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${colorClasses[color]}`}
    >
      {icon}
      {label}
    </button>
  );
}
