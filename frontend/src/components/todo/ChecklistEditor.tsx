// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. The checklist in the note editor (FR-TODO-02, D-88): per item a drag
// handle, a checkbox, a text field and Remove. Enter adds the next item (and goes there), Backspace in an empty item
// removes it (and goes to the one before), Alt+↑ / Alt+↓ move an item; a handle drags it with the mouse or, after a
// short hold, a finger. Checked items wait at the bottom in a collapsible "Checked (N)" group, crossed out; unchecking
// puts an item back in its old place. At most 200 items. Nothing is written here — the editor's Save does.
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { type ChecklistEntry, MAX_ITEMS, TEXT_MAX, uncheckedIndex } from "@/lib/checklist";
import { cn } from "@/lib/utils";
import { uuidv7 } from "@/lib/uuid";

interface ChecklistEditorProps {
  entries: ChecklistEntry[];
  onChange: (entries: ChecklistEntry[]) => void;
  /** The stored position of an item (null for a new one): where an unchecked item goes back. */
  positionOf: (id: string) => string | null;
}

interface RowProps {
  entry: ChecklistEntry;
  index: number;
  draggable: boolean;
  onText: (text: string) => void;
  onCheck: (checked: boolean) => void;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: (element: HTMLInputElement | null) => void;
}

function ItemRow({ entry, index, draggable, onText, onCheck, onRemove, onKeyDown, inputRef }: RowProps) {
  const { t } = useTranslation();
  const name = entry.text.trim() || t("todo.checklist.emptyItem", { number: index + 1 });
  const { setNodeRef: dragRef, listeners, isDragging } = useDraggable({ id: entry.id, disabled: !draggable });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: entry.id, disabled: !draggable });
  return (
    <li
      ref={dropRef}
      className={cn(
        "flex items-center gap-1 rounded-sm",
        isOver && !isDragging && "bg-primary-tint",
        isDragging && "opacity-50",
      )}
    >
      {draggable ? (
        // Pointer only: from the keyboard an item moves with Alt+↑ / Alt+↓ in its field.
        <button
          ref={dragRef}
          type="button"
          aria-label={t("todo.checklist.drag", { item: name })}
          className="grid size-11 shrink-0 cursor-grab touch-none place-items-center text-muted pointer-fine:md:size-8"
          tabIndex={-1}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      ) : (
        <span className="size-11 shrink-0 pointer-fine:md:size-8" aria-hidden />
      )}
      <input
        type="checkbox"
        checked={entry.checked}
        aria-label={t("todo.checklist.check", { item: name })}
        className="size-4 shrink-0"
        onChange={(e) => {
          onCheck(e.target.checked);
        }}
      />
      <input
        ref={inputRef}
        value={entry.text}
        maxLength={TEXT_MAX}
        aria-label={t("todo.checklist.item", { number: index + 1 })}
        className={cn(
          "h-11 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary pointer-coarse:text-base pointer-fine:md:h-8",
          entry.checked && "text-muted line-through",
        )}
        onChange={(e) => {
          onText(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <Button variant="ghost" size="icon" aria-label={t("todo.checklist.remove", { item: name })} onClick={onRemove}>
        <X aria-hidden />
      </Button>
    </li>
  );
}

export function ChecklistEditor({ entries, onChange, positionOf }: ChecklistEditorProps) {
  const { t } = useTranslation();
  const [showChecked, setShowChecked] = useState(true);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const unchecked = entries.filter((entry) => !entry.checked);
  const checked = entries.filter((entry) => entry.checked);
  const full = entries.length >= MAX_ITEMS;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  // The field to focus once React has rendered the changed list.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    inputs.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });
  const focus = (id: string | undefined) => {
    if (id) pendingFocus.current = id;
  };
  /** The unchecked list in a new order, the checked ones after it. */
  const withUnchecked = (list: ChecklistEntry[]) => [...list, ...checked];
  const update = (id: string, patch: Partial<ChecklistEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };
  const add = (after?: string) => {
    if (full) return;
    const next = { id: uuidv7(), text: "", checked: false };
    const index = after ? unchecked.findIndex((entry) => entry.id === after) + 1 : unchecked.length;
    onChange(withUnchecked([...unchecked.slice(0, index), next, ...unchecked.slice(index)]));
    focus(next.id);
  };
  const remove = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };
  const move = (id: string, by: number) => {
    const from = unchecked.findIndex((entry) => entry.id === id);
    const to = from + by;
    if (from < 0 || to < 0 || to >= unchecked.length) return;
    const list = [...unchecked];
    const [moving] = list.splice(from, 1);
    if (moving) list.splice(to, 0, moving);
    onChange(withUnchecked(list));
    focus(id);
  };
  const check = (id: string, value: boolean) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return;
    const others = entries.filter((candidate) => candidate.id !== id);
    if (value) {
      onChange([...others, { ...entry, checked: true }]);
      return;
    }
    const rest = others.filter((candidate) => !candidate.checked);
    const index = uncheckedIndex(rest, positionOf(id), positionOf);
    onChange([
      ...rest.slice(0, index),
      { ...entry, checked: false },
      ...rest.slice(index),
      ...others.filter((candidate) => candidate.checked),
    ]);
  };
  const keys = (entry: ChecklistEntry, list: ChecklistEntry[]) => (event: KeyboardEvent<HTMLInputElement>) => {
    const index = list.findIndex((candidate) => candidate.id === entry.id);
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!entry.checked) add(entry.id);
    } else if (event.key === "Backspace" && entry.text === "") {
      event.preventDefault();
      remove(entry.id);
      focus(list[index - 1]?.id ?? list[index + 1]?.id);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && !entry.checked) {
      event.preventDefault();
      move(entry.id, event.key === "ArrowUp" ? -1 : 1);
    }
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = unchecked.findIndex((entry) => entry.id === active.id);
    const to = unchecked.findIndex((entry) => entry.id === over.id);
    if (from >= 0 && to >= 0) move(String(active.id), to - from);
  };
  const row = (entry: ChecklistEntry, index: number, list: ChecklistEntry[]) => (
    <ItemRow
      key={entry.id}
      entry={entry}
      index={index}
      draggable={!entry.checked && unchecked.length > 1}
      onText={(value) => {
        update(entry.id, { text: value });
      }}
      onCheck={(value) => {
        check(entry.id, value);
      }}
      onRemove={() => {
        remove(entry.id);
      }}
      onKeyDown={keys(entry, list)}
      inputRef={(element) => {
        if (element) inputs.current.set(entry.id, element);
        else inputs.current.delete(entry.id);
      }}
    />
  );

  return (
    <section aria-label={t("todo.checklist.title")} className="flex flex-col gap-1">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <ul className="flex flex-col">{unchecked.map((entry, index) => row(entry, index, unchecked))}</ul>
      </DndContext>
      <Button
        variant="ghost"
        className="w-fit"
        disabled={full}
        onClick={() => {
          add();
        }}
      >
        <Plus aria-hidden />
        {t("todo.checklist.add")}
      </Button>
      {full ? <p className="text-xs text-muted">{t("todo.checklist.full", { max: MAX_ITEMS })}</p> : null}
      {checked.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-line pt-1">
          <Button
            variant="ghost"
            className="w-fit text-muted"
            aria-expanded={showChecked}
            onClick={() => {
              setShowChecked(!showChecked);
            }}
          >
            {showChecked ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            {t("todo.checklist.checked", { count: checked.length })}
          </Button>
          {showChecked ? (
            <ul className="flex flex-col">
              {checked.map((entry, index) => row(entry, unchecked.length + index, checked))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
