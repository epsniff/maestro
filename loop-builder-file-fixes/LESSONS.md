# Lessons Learned

<!-- Record failures, workarounds, and insights here so future iterations can avoid repeating mistakes -->

## Item 1: fix-copy-path
- **Root cause**: The context menu's `document.addEventListener("mousedown", handler)` closed the menu before `onClick` fired on menu buttons. The mousedown event fires before click, so the buttons were removed from the DOM before their click handlers could execute.
- **Fix**: Check if `e.target` is inside `ctxMenuRef.current` before closing. This pattern will apply to any future context menu additions.
- **Note**: `navigator.clipboard.writeText()` works fine in Tauri's webview — no need for `@tauri-apps/plugin-clipboard-manager`.
