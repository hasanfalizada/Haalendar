// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The columns of a board (FR-KAN-02, D-91), side by side and scrolling
// sideways (phones: one column at a time with snap and dots to jump), with "+ Add column" at the end. A column header
// shows the name, the cards in it — "cards / limit" with a WIP limit, marked when over it (a warning only) — and a menu:
// Rename…, WIP limit…, Move left / Move right, Archive, Delete… (a confirmation naming its cards; to the trash with
// Undo). A column is dragged by its header with the mouse (after 5 px) or touch (after a 300 ms hold, so a swipe still
// scrolls); Esc cancels; the keyboard way is Move left / right. Without the right to write (view share, archived board)
// nothing can be changed. Cards fill the columns with HAAL-112.
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { MoreHorizontal, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cardCount, newColumnPosition, overLimit, positionAt } from "@/lib/columns";
import { cn } from "@/lib/utils";

import { createColumn, deleteColumn, updateColumn } from "./columnWrites";
import { NameDialog } from "./NameDialog";
import { WipDialog } from "./WipDialog";

type Row = Record<string, unknown>;

const NAME_MAX = 60;

const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

interface BoardColumnsProps {
  user: string;
  boardId: string;
  /** Active columns, left to right. */
  active: Row[];
  /** Every column row of the local database (positions of new columns). */
  allColumns: readonly Row[];
  /** Every item row of the local database (cards per column). */
  items: readonly Row[];
  canWrite: boolean;
}

type Dialog = { kind: "add" } | { kind: "rename" | "wip" | "delete"; row: Row } | null;

interface DragData {
  row: Row;
}

interface DropData {
  index: number;
}

export function BoardColumns({ user, boardId, active, allColumns, items, canWrite }: BoardColumnsProps) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState<Row | null>(null);
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  const name = (row: Row) => String(row.name);

  function move(row: Row, index: number) {
    const from = active.findIndex((column) => column.id === row.id);
    if (index === from || index < 0 || index >= active.length) return;
    void updateColumn(user, row, "move", { position: positionAt(active, row, index) });
  }

  function onDragEnd(event: DragEndEvent) {
    const data = event.active.data.current as DragData | undefined;
    const drop = event.over?.data.current as DropData | undefined;
    setDragging(null);
    if (data && drop) move(data.row, drop.index);
  }

  // Which column a phone shows (the one whose left edge is nearest the strip's).
  function onScroll() {
    const element = strip.current;
    if (!element) return;
    const columns = [...element.querySelectorAll<HTMLElement>("[data-column]")];
    let best = 0;
    columns.forEach((column, index) => {
      const distance = Math.abs(column.offsetLeft - element.offsetLeft - element.scrollLeft);
      const bestDistance = Math.abs((columns[best]?.offsetLeft ?? 0) - element.offsetLeft - element.scrollLeft);
      if (distance < bestDistance) best = index;
    });
    setCurrent(best);
  }

  function show(index: number) {
    const columns = strip.current?.querySelectorAll<HTMLElement>("[data-column]");
    columns?.[index]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        onDragStart={(event) => {
          setDragging((event.active.data.current as DragData | undefined)?.row ?? null);
        }}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
        }}
        accessibility={{ screenReaderInstructions: { draggable: t("kanban.columns.dragInstructions") } }}
      >
        <div
          ref={strip}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 snap-x snap-mandatory scroll-px-3 items-start gap-3 overflow-x-auto p-3 md:snap-none md:p-4"
        >
          {active.map((row, index) => (
            <Column
              key={String(row.id)}
              row={row}
              index={index}
              count={cardCount(items, String(row.id))}
              canWrite={canWrite}
              first={index === 0}
              last={index === active.length - 1}
              onAction={(action) => {
                if (action === "left") move(row, index - 1);
                else if (action === "right") move(row, index + 1);
                else if (action === "archive")
                  void updateColumn(user, row, "archive", { archived_at: new Date().toISOString() });
                else setDialog({ kind: action, row });
              }}
            />
          ))}
          {canWrite ? (
            <div className="w-[calc(100vw-1.5rem)] shrink-0 snap-start md:w-68">
              <Button
                className="w-full justify-start"
                onClick={() => {
                  setDialog({ kind: "add" });
                }}
              >
                <Plus aria-hidden />
                {t("kanban.columns.add")}
              </Button>
            </div>
          ) : null}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div className="w-68 rounded-md border border-primary bg-surface px-3 py-2 text-[13px] font-semibold shadow-lg">
              {name(dragging)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {active.length > 1 ? (
        <nav aria-label={t("kanban.columns.dots")} className="flex justify-center gap-1 pb-2 md:hidden">
          {active.map((row, index) => (
            <button
              key={String(row.id)}
              type="button"
              aria-label={t("kanban.columns.show", { name: name(row) })}
              aria-current={index === current ? "true" : undefined}
              onClick={() => {
                show(index);
              }}
              className="grid size-11 place-items-center"
            >
              <span className={cn("size-2 rounded-full", index === current ? "bg-primary" : "bg-line")} aria-hidden />
            </button>
          ))}
        </nav>
      ) : null}

      {dialog?.kind === "add" ? (
        <NameDialog
          title={t("kanban.columns.addTitle")}
          submitLabel={t("kanban.create")}
          maxLength={NAME_MAX}
          onSave={(next) => createColumn(user, boardId, next, newColumnPosition(allColumns, boardId))}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "rename" ? (
        <NameDialog
          title={t("kanban.columns.renameTitle")}
          submitLabel={t("kanban.save")}
          maxLength={NAME_MAX}
          initial={name(dialog.row)}
          onSave={(next) => updateColumn(user, dialog.row, "rename", { name: next })}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "wip" ? (
        <WipDialog
          row={dialog.row}
          onSave={(limit) => updateColumn(user, dialog.row, "wip", { wip_limit: limit })}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("kanban.columns.deleteTitle")}
        body={
          dialog?.kind === "delete"
            ? t("kanban.columns.deleteBody", {
                name: name(dialog.row),
                count: cardCount(items, String(dialog.row.id)),
              })
            : ""
        }
        confirmLabel={t("kanban.deleteConfirm")}
        danger
        onConfirm={async () => {
          if (dialog?.kind === "delete" && (await deleteColumn(user, dialog.row))) setDialog(null);
        }}
        onClose={() => {
          setDialog(null);
        }}
      />
    </div>
  );
}

type Action = "rename" | "wip" | "left" | "right" | "archive" | "delete";

interface ColumnProps {
  row: Row;
  index: number;
  count: number;
  canWrite: boolean;
  first: boolean;
  last: boolean;
  onAction: (action: Action) => void;
}

function Column({ row, index, count, canWrite, first, last, onAction }: ColumnProps) {
  const { t } = useTranslation();
  const id = String(row.id);
  const name = String(row.name);
  const {
    setNodeRef: dragRef,
    listeners,
    isDragging,
  } = useDraggable({
    id,
    data: { row } satisfies DragData,
    disabled: !canWrite,
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `drop-${id}`, data: { index } satisfies DropData });
  const limit = typeof row.wip_limit === "number" ? row.wip_limit : null;
  const over = overLimit(row, count);
  const headingId = `column-${id}`;

  return (
    <section
      ref={dropRef}
      data-column
      aria-labelledby={headingId}
      className={cn(
        "flex max-h-full w-[calc(100vw-1.5rem)] shrink-0 snap-start flex-col rounded-md border bg-surface md:w-68",
        over ? "border-warn-fg" : "border-line",
        isOver && "outline-2 outline-primary",
        isDragging && "opacity-50",
      )}
    >
      <div
        ref={dragRef}
        {...(canWrite ? listeners : {})}
        className={cn("flex items-center gap-2 px-3 py-1.5", canWrite && "cursor-grab")}
      >
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {name}
        </h2>
        <span
          className={cn(
            "rounded-sm px-1.5 text-xs tabular-nums",
            over ? "bg-warn-bg font-semibold text-warn-fg" : "text-muted",
          )}
          title={over ? t("kanban.columns.overLimit") : undefined}
          aria-label={
            limit === null
              ? t("kanban.columns.count", { count })
              : t(over ? "kanban.columns.countOver" : "kanban.columns.countLimit", { count, limit })
          }
        >
          {limit === null ? count : `${String(count)} / ${String(limit)}`}
        </span>
        {canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={t("kanban.columns.menu", { name })}
                // The menu button is not a drag handle.
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={() => {
                  onAction("rename");
                }}
              >
                {t("kanban.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onAction("wip");
                }}
              >
                {t("kanban.columns.wip")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={first}
                onSelect={() => {
                  onAction("left");
                }}
              >
                {t("kanban.columns.moveLeft")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={last}
                onSelect={() => {
                  onAction("right");
                }}
              >
                {t("kanban.columns.moveRight")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onAction("archive");
                }}
              >
                {t("kanban.archive")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                danger
                onSelect={() => {
                  onAction("delete");
                }}
              >
                {t("kanban.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="min-h-16 px-3 pb-3">
        {count === 0 ? <p className="text-xs text-muted">{t("kanban.columns.noCards")}</p> : null}
      </div>
    </section>
  );
}
