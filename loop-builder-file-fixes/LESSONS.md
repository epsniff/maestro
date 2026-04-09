# Lessons Learned

<!-- Record failures, workarounds, and insights here so future iterations can avoid repeating mistakes -->

## Item 1: fix-copy-path
- **Root cause**: The context menu's `document.addEventListener("mousedown", handler)` closed the menu before `onClick` fired on menu buttons. The mousedown event fires before click, so the buttons were removed from the DOM before their click handlers could execute.
- **Fix**: Check if `e.target` is inside `ctxMenuRef.current` before closing. This pattern will apply to any future context menu additions.
- **Note**: `navigator.clipboard.writeText()` works fine in Tauri's webview — no need for `@tauri-apps/plugin-clipboard-manager`.

## Item 4: add-delete-file-context-menu
- **Approach**: Added `delete_path` Rust command with `project_root` safety parameter. Uses `canonicalize()` on both paths to prevent path traversal attacks. Frontend uses `window.confirm()` for simplicity.
- **Note**: The command handles both files and directories — `remove_file` for files, `remove_dir_all` for directories. The `starts_with` check on canonicalized paths is the safety gate.

## Item 3: fix-open-file-paste-path
- **Root cause**: The file path text input only called `onSetFilePath` (which updates `slot.filePath`) on Enter key press. The launch button checks `slot.filePath` (not the local input state), so pasting a path didn't enable the button until Enter was pressed.
- **Fix**: Call `onSetFilePath` in the `onChange` handler on every input change, resolving relative paths against the project root. The Enter key handler still works as a "confirm and clear" action.
