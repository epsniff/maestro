import { memo, useCallback, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { xml } from "@codemirror/lang-xml";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { php } from "@codemirror/lang-php";
import { FileText, GripVertical, Loader2, Maximize2, Minimize2, Save, X } from "lucide-react";

// ── Custom CodeMirror theme using Maestro CSS variables ──

const maestroEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "rgb(var(--maestro-surface))",
      color: "rgb(var(--maestro-text))",
    },
    ".cm-gutters": {
      backgroundColor: "rgb(var(--maestro-bg))",
      color: "rgb(var(--maestro-muted))",
      borderRight: "1px solid rgb(var(--maestro-border))",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgb(var(--maestro-card))",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "rgb(var(--maestro-accent) / 0.2)",
    },
    ".cm-activeLine": {
      backgroundColor: "rgb(var(--maestro-card) / 0.5)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "rgb(var(--maestro-accent))",
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "rgb(var(--maestro-accent) / 0.25)",
      outline: "1px solid rgb(var(--maestro-accent) / 0.5)",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgb(var(--maestro-orange) / 0.3)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgb(var(--maestro-orange) / 0.5)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgb(var(--maestro-card))",
      borderColor: "rgb(var(--maestro-border))",
      color: "rgb(var(--maestro-muted))",
    },
    ".cm-tooltip": {
      backgroundColor: "rgb(var(--maestro-surface))",
      border: "1px solid rgb(var(--maestro-border))",
      color: "rgb(var(--maestro-text))",
    },
  },
  { dark: true },
);

const maestroHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "rgb(var(--maestro-purple))" },
    { tag: [tags.name, tags.deleted, tags.character, tags.macroName], color: "rgb(var(--maestro-text))" },
    { tag: [tags.function(tags.variableName), tags.labelName], color: "rgb(var(--maestro-accent))" },
    { tag: [tags.propertyName], color: "rgb(var(--maestro-accent))" },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "rgb(var(--maestro-orange))" },
    { tag: [tags.definition(tags.name), tags.separator], color: "rgb(var(--maestro-text))" },
    { tag: [tags.typeName, tags.className, tags.changed, tags.annotation, tags.self, tags.namespace],
      color: "#e5c07b" },
    { tag: [tags.number], color: "rgb(var(--maestro-orange))" },
    { tag: [tags.operator, tags.operatorKeyword], color: "rgb(var(--maestro-purple))" },
    { tag: [tags.url, tags.escape, tags.regexp, tags.link], color: "#56d4dd" },
    { tag: [tags.string, tags.special(tags.string)], color: "rgb(var(--maestro-green))" },
    { tag: [tags.meta], color: "rgb(var(--maestro-muted))" },
    { tag: [tags.comment], color: "rgb(var(--maestro-muted))", fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.heading, fontWeight: "bold", color: "rgb(var(--maestro-accent))" },
    { tag: tags.link, color: "rgb(var(--maestro-accent))", textDecoration: "underline" },
    { tag: tags.invalid, color: "rgb(var(--maestro-red))" },
  ]),
);

const maestroTheme: Extension = [maestroEditorTheme, maestroHighlightStyle];

interface FileEditorViewProps {
  sessionId: number;
  slotId: string;
  filePath: string;
  content: string;
  isDirty: boolean;
  isSaving?: boolean;
  error?: string | null;
  isFocused?: boolean;
  terminalCount?: number;
  isZoomed?: boolean;
  onFocus?: () => void;
  onChange: (content: string) => void;
  onSave: () => void;
  onClose: (sessionId: number) => void;
  onToggleZoom?: () => void;
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

function getLanguageExtension(filePath: string): Extension | undefined {
  const name = basename(filePath).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : undefined;

  // Handle extensionless files by name
  if (!ext || name === "dockerfile" || name === "containerfile") {
    return undefined; // plain text
  }
  if (name === "makefile" || name === "gnumakefile") {
    return undefined; // plain text
  }

  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs":
      return javascript({ jsx: true });
    case "ts": case "tsx": case "mts": case "cts":
      return javascript({ jsx: true, typescript: true });
    case "py": case "pyw":
      return python();
    case "rs":
      return rust();
    case "json": case "jsonc":
      return json();
    case "html": case "htm":
      return html();
    case "css": case "scss": case "less":
      return css();
    case "md": case "mdx": case "markdown":
      return markdown();
    case "xml": case "svg": case "xsl": case "xslt": case "plist":
      return xml();
    case "sql":
      return sql();
    case "yml": case "yaml":
      return yaml();
    case "c": case "h": case "cpp": case "cxx": case "cc": case "hpp": case "hxx":
      return cpp();
    case "java":
      return java();
    case "go":
      return go();
    case "php":
      return php();
    default:
      return undefined;
  }
}

export const FileEditorView = memo(function FileEditorView({
  sessionId,
  slotId,
  filePath,
  content,
  isDirty,
  isSaving = false,
  error,
  isFocused = false,
  terminalCount = 1,
  isZoomed = false,
  onFocus,
  onChange,
  onSave,
  onClose,
  onToggleZoom,
}: FileEditorViewProps) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef: setDragRef, isDragging } =
    useDraggable({
      id: slotId,
      disabled: !slotId,
    });

  const saveKeymap = useCallback(
    () =>
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            onSaveRef.current();
            return true;
          },
        },
      ]),
    [],
  );

  const editorExtensions = useMemo(() => {
    const exts: Extension[] = [saveKeymap()];
    const langExt = filePath ? getLanguageExtension(filePath) : undefined;
    if (langExt) exts.push(langExt);
    return exts;
  }, [filePath, saveKeymap]);

  const compact = !isZoomed && terminalCount >= 5;

  return (
    <div
      className={`terminal-cell flex h-full flex-col bg-maestro-bg ${isFocused ? "terminal-cell-focused" : "terminal-cell-idle"}`}
      onClick={onFocus}
    >
      <div
        className={`flex shrink-0 items-center gap-2 border-b border-maestro-border bg-maestro-surface px-3 ${compact ? "h-9" : "h-10"}`}
      >
        <button
          type="button"
          ref={setDragRef}
          {...dragAttributes}
          {...dragListeners}
          className={`rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
        <FileText size={16} className="shrink-0 text-maestro-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-maestro-text">{basename(filePath)}</span>
            {isDirty && <span className="text-[11px] font-medium text-maestro-orange">Unsaved</span>}
          </div>
          <div className="truncate text-[11px] text-maestro-muted">{filePath}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          disabled={isSaving || !isDirty}
          className="flex items-center gap-1 rounded border border-maestro-border px-2 py-1 text-xs text-maestro-text transition-colors hover:bg-maestro-card disabled:cursor-default disabled:opacity-50"
          title="Save (Cmd/Ctrl+S)"
        >
          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save
        </button>
        {onToggleZoom && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleZoom();
            }}
            className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
            title={isZoomed ? "Exit zoom" : "Zoom pane"}
          >
            {isZoomed ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose(sessionId);
          }}
          className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-red"
          title="Close file"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {error && <div className="border-b border-maestro-border bg-maestro-red/10 px-3 py-2 text-xs text-maestro-red">{error}</div>}
        <div className="min-h-0 flex-1 overflow-auto">
          <CodeMirror
            ref={cmRef}
            value={content}
            onChange={(val) => onChange(val)}
            theme={maestroTheme}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              bracketMatching: true,
              highlightActiveLine: true,
            }}
            extensions={editorExtensions}
            height="100%"
            style={{ height: "100%" }}
          />
        </div>
      </div>
    </div>
  );
});
