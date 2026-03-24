# Worktree Card — Design Spec

## Goal

Add a "Worktrees" card to the RightPanel Status tab that visualizes all git worktrees for the current project, shows which sessions are using them, and highlights orphaned worktrees that may need cleanup.

## Placement

New card in the **Status tab** of `RightPanel.tsx`, positioned below the branch selector card and above the session status legend card.

## New File

`src/components/shared/WorktreeCard.tsx` — self-contained component with local data fetching.

## Data Sources

- **Worktree list:** `listWorktrees(repoPath)` from `src/lib/worktreeManager.ts` — returns `WorktreeInfo[]` with `path`, `branch`, `head`, `is_main_worktree`, `is_bare`.
- **Active sessions:** `useSessionStore` — `SessionConfig[]` with `worktree_path`, `status`, `mode`, `id`, `name`, `project_path`.
- **Cross-reference:** Match `WorktreeInfo.path` to `SessionConfig.worktree_path` to determine which worktrees have active sessions. For the main worktree, match sessions where `worktree_path` is null and `project_path` matches the repo path.

## Refresh Strategy

- **On mount / visibility change:** Fetch worktree list immediately when the card becomes visible (panel open + Status tab selected).
- **Polling:** Every 5 seconds while visible. Stop polling when panel is collapsed or Status tab is not active.
- **Session reactivity:** Subscribe to `useSessionStore.sessions`. When the sessions array reference changes (session added, removed, or status updated), trigger an immediate worktree list refresh.
- **Visibility prop:** RightPanel passes `isVisible: boolean` (true when panel is open AND Status tab is selected). The card uses this to gate polling.

## Row Layout — Collapsed

```
[status dot] branch-name ........................ Session N [chevron]
```

- **Status dot:** Colored circle matching session status (green = Idle, yellow = Working, blue = NeedsInput, gray = no session).
- **Branch name:** Primary text label. For the main worktree, append a dimmed `(repo)` suffix.
- **Session label:** Right-aligned, shows session display name or "Session N". Omitted for orphaned worktrees.
- **Orphaned badge:** Red "orphaned" text badge, shown instead of session label when no active session uses this worktree.
- **Chevron:** `ChevronDown` when collapsed, `ChevronUp` when expanded. Entire row is clickable to toggle.

### Visual Differentiation

- **Main worktree:** Always listed first. Branch name has slightly dimmed color with `(repo)` suffix. No delete action.
- **Active worktrees:** Normal text color, status dot matches session status.
- **Orphaned worktrees:** Dimmed text, gray status dot, red "orphaned" badge.

## Row Layout — Expanded

Clicking a row expands it to reveal:

- **Path:** Worktree filesystem path, truncated with full path in `title` attribute on hover.
- **Session info (if active):** AI mode (Claude/Gemini/Codex/etc.) and status text.
- **Action buttons** (styled as small pill buttons):

| Worktree State | Actions |
|---|---|
| Active (has session) | Focus Session, Open in Finder |
| Orphaned (no session) | Launch Session, Open in Finder, Delete |
| Main worktree (has session) | Focus Session, Open in Finder |
| Main worktree (no session) | Open in Finder |

### Action Behaviors

- **Focus Session:** Calls a callback prop (`onFocusSession(sessionId)`) that zooms/focuses the terminal grid on that session.
- **Open in Finder:** Uses Tauri `shell.open()` to reveal the worktree directory in the system file manager.
- **Launch Session:** Calls a callback prop (`onLaunchSession(branch, worktreePath)`) that creates a new pre-launch slot pre-configured with the orphaned worktree's branch.
- **Delete:** Calls `cleanupSessionWorktree(repoPath, worktreePath)` to remove the worktree, then refreshes the list. Shows a confirmation prompt before deletion.

## Sorting Order

1. Main worktree — always first
2. Active worktrees — sorted by session ID ascending (creation order)
3. Orphaned worktrees — sorted alphabetically by branch name

## Props Interface

```typescript
interface WorktreeCardProps {
  repoPath: string;
  isVisible: boolean;
  onFocusSession: (sessionId: number) => void;
  onLaunchSession: (branch: string) => void;
}
```

## Integration Points

### RightPanel.tsx

- Import and render `WorktreeCard` in the Status tab section.
- Pass `isVisible` based on panel open state and active tab.
- Pass `repoPath` from existing props.
- Wire `onFocusSession` to communicate with TerminalGrid (via existing callback plumbing or a lightweight event).
- Wire `onLaunchSession` to trigger slot creation with branch pre-selected.

### No New Stores

All data fetching is component-local (Approach 1). `listWorktrees()` is called inside the component. `useSessionStore` is subscribed to directly. No new Zustand store needed.

## Styling

- Follow existing RightPanel card patterns (rounded container, `bg-maestro-card`, `border-maestro-border`).
- Use existing Maestro CSS variable color system (`text-maestro-text`, `text-maestro-muted`, `bg-maestro-surface`).
- Status dot colors reuse the session status color mapping already used in the session legend card.
- Action buttons: small pills with translucent background matching their semantic color (green for launch, blue for open, red for delete).
- Compact row height (~32px collapsed) to keep the list scannable.

## Edge Cases

- **No worktrees:** Show a single line "No worktrees" in muted text. The main worktree always exists, so this only happens if `listWorktrees` fails.
- **Fetch error:** Show "Failed to load worktrees" with a retry button.
- **Many worktrees:** No pagination — scroll within the card. Maestro worktrees are bounded by session count (max ~12).
- **Session on main checkout without worktree:** Sessions that use the project path directly (no branch selected) show as using the main worktree.
