# Lessons Learned

<!-- Record failures, workarounds, and insights here so future iterations can avoid repeating mistakes -->

## Item 1: fix-copy-path
- **Root cause**: The context menu's `document.addEventListener("mousedown", handler)` closed the menu before `onClick` fired on menu buttons. The mousedown event fires before click, so the buttons were removed from the DOM before their click handlers could execute.
- **Fix**: Check if `e.target` is inside `ctxMenuRef.current` before closing. This pattern will apply to any future context menu additions.
- **Note**: `navigator.clipboard.writeText()` works fine in Tauri's webview — no need for `@tauri-apps/plugin-clipboard-manager`.

## Item 4: add-delete-file-context-menu
- **Approach**: Added `delete_path` Rust command with `project_root` safety parameter. Uses `canonicalize()` on both paths to prevent path traversal attacks. Frontend uses `window.confirm()` for simplicity.
- **Note**: The command handles both files and directories — `remove_file` for files, `remove_dir_all` for directories. The `starts_with` check on canonicalized paths is the safety gate.

## Item 5a: install-codemirror-basic-editor
- **Approach**: Replaced `<textarea>` with `@uiw/react-codemirror` using oneDark theme. Used `keymap` from `@codemirror/view` for Cmd/Ctrl+S save binding via a ref-based callback to avoid stale closure issues with `onSave`.
- **Note**: The `useCallback` wrapping `saveKeymap` with empty deps + `onSaveRef` pattern avoids recreating extensions on every render while keeping the save callback current. CodeMirror re-initializes when `extensions` array identity changes, so stable references matter.
- **Note**: `height="100%"` and `style={{ height: "100%" }}` both needed on the CodeMirror component, with the parent div having `min-h-0 flex-1 overflow-auto` for proper flex sizing.

## Item 5b: add-language-detection-highlighting
- **Approach**: Installed 14 `@codemirror/lang-*` packages. Added `getLanguageExtension()` function with extension-based switch and special-case handling for extensionless files (Dockerfile, Makefile). Used `useMemo` keyed on `filePath` to avoid recreating the extensions array on every render (important per Item 5a lesson about CodeMirror re-initializing when extensions identity changes).
- **Note**: The `editorExtensions` memo combines both the save keymap and the language extension into a single stable array, replacing the inline `[saveKeymap()]` that was recreated each render.

## Item 3: fix-open-file-paste-path
- **Root cause**: The file path text input only called `onSetFilePath` (which updates `slot.filePath`) on Enter key press. The launch button checks `slot.filePath` (not the local input state), so pasting a path didn't enable the button until Enter was pressed.
- **Fix**: Call `onSetFilePath` in the `onChange` handler on every input change, resolving relative paths against the project root. The Enter key handler still works as a "confirm and clear" action.
