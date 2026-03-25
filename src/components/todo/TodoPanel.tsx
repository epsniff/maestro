import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTodoStore } from "@/stores/useTodoStore";
import { TodoItemRow } from "./TodoItemRow";

interface TodoPanelProps {
  projectPath: string;
}

export function TodoPanel({ projectPath }: TodoPanelProps) {
  const { todos, loading, fetchTodos, addTodo, reorderTodos, initListener } = useTodoStore();
  const items = todos[projectPath] || [];
  const isLoading = loading[projectPath] || false;
  const newItemIdRef = useRef<string | null>(null);

  // Fetch on mount
  useEffect(() => {
    fetchTodos(projectPath);
  }, [projectPath, fetchTodos]);

  // Listen for backend changes (MCP-originated)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    initListener().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [initListener]);

  // Split items: unchecked first, checked last
  const { unchecked, checked } = useMemo(() => {
    const unchecked = items.filter((i) => !i.completed);
    const checked = items.filter((i) => i.completed);
    return { unchecked, checked };
  }, [items]);

  const uncheckedIds = useMemo(() => unchecked.map((i) => i.id), [unchecked]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = uncheckedIds.indexOf(active.id as string);
      const newIndex = uncheckedIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      // Build new order
      const newIds = [...uncheckedIds];
      newIds.splice(oldIndex, 1);
      newIds.splice(newIndex, 0, active.id as string);

      reorderTodos(projectPath, newIds);
    },
    [uncheckedIds, projectPath, reorderTodos],
  );

  const handleAdd = useCallback(async () => {
    const item = await addTodo(projectPath, "");
    newItemIdRef.current = item.id;
    // Refetch to get sorted list
    fetchTodos(projectPath);
  }, [projectPath, addTodo, fetchTodos]);

  if (isLoading && items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-maestro-muted/60">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-maestro-border/30 px-2.5 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-maestro-muted">
          To-Do
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded p-0.5 text-maestro-muted hover:bg-maestro-surface-bright hover:text-maestro-text"
          title="Add to-do item"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <span className="text-xs text-maestro-muted/60">No to-do items yet</span>
            <button
              type="button"
              onClick={handleAdd}
              className="text-xs text-maestro-accent hover:underline"
            >
              Add one
            </button>
          </div>
        ) : (
          <>
            {/* Unchecked items — draggable */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={uncheckedIds} strategy={verticalListSortingStrategy}>
                {unchecked.map((item) => (
                  <TodoItemRow
                    key={item.id}
                    item={item}
                    projectPath={projectPath}
                    isDraggable
                    isNew={item.id === newItemIdRef.current}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Divider between unchecked and checked */}
            {checked.length > 0 && unchecked.length > 0 && (
              <div className="my-1.5 border-t border-maestro-border/20" />
            )}

            {/* Checked items — not draggable */}
            {checked.map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                projectPath={projectPath}
                isDraggable={false}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
