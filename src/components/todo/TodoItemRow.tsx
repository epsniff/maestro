import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TodoItem } from "@/stores/useTodoStore";
import { useTodoStore } from "@/stores/useTodoStore";

interface TodoItemRowProps {
  item: TodoItem;
  projectPath: string;
  isDraggable: boolean;
  isNew?: boolean;
}

export function TodoItemRow({ item, projectPath, isDraggable, isNew }: TodoItemRowProps) {
  const { updateTodo, removeTodo } = useTodoStore();
  const [text, setText] = useState(item.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  });

  const style: React.CSSProperties = isDraggable
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }
    : {};

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: text triggers resize when content changes
  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  // Focus new items
  useEffect(() => {
    if (isNew && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isNew]);

  // Sync external text changes
  useEffect(() => {
    setText(item.text);
  }, [item.text]);

  const handleBlur = useCallback(() => {
    if (text !== item.text) {
      updateTodo(projectPath, item.id, { text });
    }
  }, [text, item.text, item.id, projectPath, updateTodo]);

  const handleToggle = useCallback(() => {
    updateTodo(projectPath, item.id, { completed: !item.completed });
  }, [projectPath, item.id, item.completed, updateTodo]);

  const handleRemove = useCallback(() => {
    removeTodo(projectPath, item.id);
  }, [projectPath, item.id, removeTodo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      textareaRef.current?.blur();
    }
  }, []);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-start gap-1.5 rounded px-1.5 py-1 ${
        isDragging ? "bg-maestro-surface-bright" : "hover:bg-maestro-surface-bright/50"
      }`}
    >
      {/* Drag handle */}
      {isDraggable ? (
        <button
          type="button"
          className="mt-0.5 flex-shrink-0 cursor-grab text-maestro-muted/40 hover:text-maestro-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      ) : (
        <div className="w-3.5 flex-shrink-0" />
      )}

      {/* Checkbox */}
      <button
        type="button"
        onClick={handleToggle}
        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
          item.completed
            ? "border-maestro-accent bg-maestro-accent text-white"
            : "border-maestro-border hover:border-maestro-accent"
        }`}
      >
        {item.completed && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5L4.5 7.5L8 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Text */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={1}
        className={`min-h-[20px] flex-1 resize-none overflow-hidden bg-transparent text-xs leading-5 outline-none ${
          item.completed ? "text-maestro-muted line-through" : "text-maestro-text"
        }`}
        placeholder="Type something..."
      />

      {/* Delete button — visible on group hover */}
      <button
        type="button"
        onClick={handleRemove}
        className="mt-0.5 flex-shrink-0 text-maestro-muted/40 opacity-0 hover:text-red-400 group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
