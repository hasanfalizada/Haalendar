// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The columns of a board (FR-KAN-02, D-91), side by side and scrolling
// sideways (phones: one column at a time with snap and dots to jump), with "+ Add column" at the end. A column header
// shows the name, the cards in it — "cards / limit" with a WIP limit, marked when over it (a warning only) — and a menu:
// Rename…, WIP limit…, Move left / Move right, Archive, Delete… (a confirmation naming its cards; to the trash with
// Undo). A column is dragged by its header with the mouse (after 5 px) or touch (after a 300 ms hold, so a swipe still
// scrolls); Esc cancels; the keyboard way is Move left / right. Without the right to write (view share, archived board)
// nothing can be changed. Cards fill the columns with HAAL-112.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Each column lists its cards top to bottom (CardTile; a card opens the
// editor) and ends with "+ Add card" for whoever may write (D-92).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. Cards are dragged within and between columns (FR-KAN-04): a line shows
// where the card goes, a column's empty part means its end; near the strip's edge the columns scroll (phones: the snap
// rests while dragging); Esc cancels. Alt+↑ / Alt+↓ move the card in its column, Alt+← / Alt+→ to the same place in the
// column beside (keeping the focus on it). Each move is one write with Undo and is told to screen readers.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. A card shows a bell while one of the user's reminders is ahead (D-94).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-117. And its overdue / due-soon badge, moved on every minute (D-95).
import {
  type Active,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
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
import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { useSettings } from "@/api/settings";
import {
  type CardPlace,
  type CardStep,
  cardPositionAt,
  cardStepTarget,
  cardsOf,
  dueState,
  isCardAt,
  labelsOf,
  newCardPosition,
} from "@/lib/cards";
import { checklistOf } from "@/lib/checklist";
import { cardCount, newColumnPosition, overLimit, positionAt } from "@/lib/columns";
import { cardReminderAhead } from "@/lib/reminders";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";

import { AddCard } from "./AddCard";
import { createCard, moveCard } from "./cardWrites";
import { type CardDragData, type CardDropData, CardTile } from "./CardTile";
import { createColumn, deleteColumn, updateColumn } from "./columnWrites";
import { NameDialog } from "./NameDialog";
import { WipDialog } from "./WipDialog";

type Row = Record<string, unknown>;

const NAME_MAX = 60;

// A column is dropped on columns only; a card on a card under the pointer, else on the column it is over, else on the
// column whose lane it is in below the column's end (a short column on a phone).
const collisions: CollisionDetection = (args) => {
  const kind = (args.active.data.current as DragData | undefined)?.type;
  const of = (type: DropData["type"]) =>
    args.droppableContainers.filter((container) => (container.data.current as DropData | undefined)?.type === type);
  if (kind === "card") {
    const cards = pointerWithin({ ...args, droppableContainers: of("card") });
    if (cards.length > 0) return cards;
  }
  const columns = { ...args, droppableContainers: of("column") };
  const hits = pointerWithin(columns);
  if (hits.length > 0) return hits;
  const pointer = args.pointerCoordinates;
  if (kind === "card" && pointer) {
    const lane = columns.droppableContainers.find((container) => {
      const rect = args.droppableRects.get(container.id);
      return rect !== undefined && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top;
    });
    return lane ? [{ id: lane.id, data: { droppableContainer: lane, value: 0 } }] : [];
  }
  return rectIntersection(columns);
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
  /** The board's labels, the labels on items, checklist items and attachment counts per item (the cards show them). */
  labels: readonly Row[];
  itemLabels: readonly Row[];
  checklistItems: readonly Row[];
  attachments: ReadonlyMap<string, number>;
  /** The user's reminder rows (the bell on a card) and the zone its due date is read in. */
  reminders: readonly Row[];
  timeZone: string;
  onOpenCard: (card: Row) => void;
}

type Dialog = { kind: "add" } | { kind: "rename" | "wip" | "delete"; row: Row } | null;

interface ColumnDragData {
  type: "column";
  row: Row;
}

interface ColumnDropData {
  type: "column";
  index: number;
  columnId: string;
}

type DragData = ColumnDragData | CardDragData;
type DropData = ColumnDropData | CardDropData;

const dragOf = (active: Active) => active.data.current as DragData | undefined;

export function BoardColumns({
  user,
  boardId,
  active,
  allColumns,
  items,
  canWrite,
  labels,
  itemLabels,
  checklistItems,
  attachments,
  reminders,
  timeZone,
  onOpenCard,
}: BoardColumnsProps) {
  const { t } = useTranslation();
  const { default_color: defaultColor } = useSettings();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [dropAt, setDropAt] = useState<CardPlace | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const now = useNow();
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  // The card moved from the keyboard gets the focus back once it is in its new place.
  const refocus = useRef<{ id: string; position: string } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  const name = (row: Row) => String(row.name);
  const titleOf = (row: Row) => (typeof row.title === "string" ? row.title : "");
  const dragName = (data: DragData | undefined) =>
    data ? (data.type === "column" ? name(data.row) : titleOf(data.row)) : "";

  useEffect(() => {
    const want = refocus.current;
    if (!want || items.find((item) => item.id === want.id)?.position !== want.position) return;
    refocus.current = null;
    strip.current?.querySelector<HTMLElement>(`[data-card="${want.id}"]`)?.focus();
  }, [items]);

  function move(row: Row, index: number) {
    const from = active.findIndex((column) => column.id === row.id);
    if (index === from || index < 0 || index >= active.length) return;
    void updateColumn(user, row, "move", { position: positionAt(active, row, index) });
  }

  async function moveTo(card: Row, place: CardPlace, keepFocus = false) {
    if (isCardAt(items, card, place)) return;
    const position = cardPositionAt(items, card, place.columnId, place.index);
    const column = active.find((row) => row.id === place.columnId);
    if (keepFocus) refocus.current = { id: String(card.id), position };
    const total = cardsOf(items, place.columnId).filter((row) => row.id !== card.id).length + 1;
    const ok = await moveCard(user, card, place.columnId, position);
    if (!ok) {
      refocus.current = null;
      return;
    }
    setAnnouncement(
      t("kanban.cards.moved", {
        title: titleOf(card),
        column: column ? name(column) : "",
        position: place.index + 1,
        total,
      }),
    );
  }

  function step(card: Row, direction: CardStep) {
    const place = cardStepTarget(
      items,
      active.map((row) => String(row.id)),
      card,
      direction,
    );
    if (place) void moveTo(card, place, true);
  }

  // Where a dragged card would go: before or after the card it is over (by the halves), or the end of a column.
  function placeOf(event: DragMoveEvent | DragEndEvent): CardPlace | null {
    const data = dragOf(event.active);
    const over = event.over;
    const drop = over?.data.current as DropData | undefined;
    if (data?.type !== "card" || !over || !drop) return null;
    const others = cardsOf(items, drop.columnId).filter((row) => row.id !== data.row.id);
    if (drop.type === "column") return { columnId: drop.columnId, index: others.length };
    const at = others.findIndex((row) => row.id === drop.cardId);
    if (at < 0) return null; // over itself: it stays
    const moving = event.active.rect.current.translated;
    const below = moving !== null && moving.top + moving.height / 2 > over.rect.top + over.rect.height / 2;
    return { columnId: drop.columnId, index: at + (below ? 1 : 0) };
  }

  function onDragMove(event: DragMoveEvent) {
    const place = placeOf(event);
    const data = dragOf(event.active);
    const shown = place && data?.type === "card" && !isCardAt(items, data.row, place) ? place : null;
    setDropAt((was) => (was?.columnId === shown?.columnId && was?.index === shown?.index ? was : shown));
  }

  function onDragEnd(event: DragEndEvent) {
    const data = dragOf(event.active);
    const drop = event.over?.data.current as DropData | undefined;
    const place = placeOf(event);
    setDragging(null);
    setDropAt(null);
    if (data?.type === "column" && drop?.type === "column") move(data.row, drop.index);
    else if (data?.type === "card" && place) void moveTo(data.row, place);
  }

  // The cards of a column with the drop line where a dragged card would go.
  function cardList(columnId: string): ReactNode {
    const moving = dragging?.type === "card" ? dragging.row.id : null;
    const line = dropAt?.columnId === columnId ? dropAt.index : null;
    const nodes: ReactNode[] = [];
    let index = 0;
    const lineAt = (at: number) => {
      if (line === at) nodes.push(<DropLine key="drop-line" />);
    };
    for (const card of cardsOf(items, columnId)) {
      const cardId = String(card.id);
      if (card.id !== moving) lineAt(index++);
      const list = checklistOf(checklistItems, cardId);
      const total = list.unchecked.length + list.checked.length;
      nodes.push(
        <CardTile
          key={cardId}
          row={card}
          labels={labelsOf(cardId, itemLabels, labels)}
          progress={total > 0 ? { done: list.checked.length, total } : null}
          attachments={attachments.get(cardId) ?? 0}
          reminder={cardReminderAhead(reminders, card, timeZone, now)}
          dueState={dueState(card, timeZone, now)}
          onOpen={() => {
            onOpenCard(card);
          }}
          onStep={
            canWrite
              ? (direction) => {
                  step(card, direction);
                }
              : undefined
          }
        />,
      );
    }
    lineAt(index);
    return nodes.length > 0 ? <ul className="-my-1 flex flex-col">{nodes}</ul> : null;
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
        // Slower than dnd-kit's default near the edges (about a column a second), so a phone stops at the column beside.
        autoScroll={{ acceleration: 2 }}
        onDragStart={(event) => {
          setDragging(dragOf(event.active) ?? null);
        }}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragging(null);
          setDropAt(null);
        }}
        accessibility={{
          screenReaderInstructions: { draggable: t("kanban.columns.dragInstructions") },
          announcements: {
            onDragStart: ({ active: picked }) => t("kanban.drag.picked", { name: dragName(dragOf(picked)) }),
            onDragOver: () => undefined,
            // A card's drop is told by the move itself (where it went).
            onDragEnd: ({ active: dropped }) => {
              const data = dragOf(dropped);
              return data?.type === "column" ? t("kanban.drag.dropped", { name: dragName(data) }) : undefined;
            },
            onDragCancel: ({ active: cancelled }) => t("kanban.drag.cancelled", { name: dragName(dragOf(cancelled)) }),
          },
        }}
      >
        <div
          ref={strip}
          onScroll={onScroll}
          className={cn(
            "flex min-h-0 flex-1 scroll-px-3 items-start gap-3 overflow-x-auto p-3 md:snap-none md:p-4",
            // The snap would pull the strip back while a card is carried to the column beside.
            dragging ? "snap-none" : "snap-x snap-mandatory",
          )}
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
              target={
                dragging?.type === "card" ? dropAt?.columnId === row.id : dragging?.type === "column" ? null : false
              }
              cards={
                <>
                  {cardList(String(row.id))}
                  {canWrite ? (
                    <AddCard
                      columnName={name(row)}
                      onAdd={(title) =>
                        createCard(user, {
                          boardId,
                          columnId: String(row.id),
                          title,
                          position: newCardPosition(items, String(row.id)),
                          color: defaultColor,
                        })
                      }
                    />
                  ) : null}
                </>
              }
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
          {dragging?.type === "column" ? (
            <div className="w-68 rounded-md border border-primary bg-surface px-3 py-2 text-[13px] font-semibold shadow-lg">
              {name(dragging.row)}
            </div>
          ) : null}
          {dragging?.type === "card" ? (
            <div className="w-64 rounded-sm border border-primary bg-bg p-2 pl-3 text-[13px] font-medium wrap-anywhere shadow-lg">
              {titleOf(dragging.row)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

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

/** Where a dragged card would go (no room taken, so the targets under the pointer stay put). */
function DropLine() {
  return (
    <li aria-hidden className="relative h-0">
      <span className="absolute inset-x-0 -top-px h-0.5 rounded-full bg-primary" />
    </li>
  );
}

interface ColumnProps {
  row: Row;
  /** A card would go into it (true), a column is being dragged (null: marked when over), or neither (false). */
  target: boolean | null;
  /** The cards and "+ Add card". */
  cards: ReactNode;
  index: number;
  count: number;
  canWrite: boolean;
  first: boolean;
  last: boolean;
  onAction: (action: Action) => void;
}

function Column({ row, target, cards, index, count, canWrite, first, last, onAction }: ColumnProps) {
  const { t } = useTranslation();
  const id = String(row.id);
  const name = String(row.name);
  const {
    setNodeRef: dragRef,
    listeners,
    isDragging,
  } = useDraggable({
    id,
    data: { type: "column", row } satisfies ColumnDragData,
    disabled: !canWrite,
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop-${id}`,
    data: { type: "column", index, columnId: id } satisfies ColumnDropData,
  });
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
        (target ?? isOver) && "outline-2 outline-primary",
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
      <div className="flex min-h-16 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {count === 0 && !canWrite ? <p className="px-1 text-xs text-muted">{t("kanban.columns.noCards")}</p> : null}
        {cards}
      </div>
    </section>
  );
}
