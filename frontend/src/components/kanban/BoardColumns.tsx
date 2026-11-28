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
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. Under the board filters (D-96) a column lists the cards shown, its
// count reads "3 of 7"; moves work among the cards shown (lib/cards indexAmongAll) and a card added that the filters
// hide says so.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. A card shows its assignees' initials (D-97).
// +++===+++ 2026-11-27 — Hasan Alizada — HAAL-115 (FR-KAN-06, D-130). Swimlanes: with `lanes` the column headers stay
// on top (sticky) and each lane is a row under them — its name and count fold it — with a cell per column; a card is
// dragged within its lane and into another one (it takes that lane's priority or assignee; between label lanes it
// stays), Alt+arrows move it within its lane, "+ Add card" of a cell gives the new card the lane's value. Without
// `lanes` the board is as before.
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
import { ChevronRight, MoreHorizontal, Plus } from "lucide-react";
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
import type { Color } from "@/api/generated/types.gen";
import type { Priority } from "@/atoms/items/priority";
import { useSettings } from "@/api/settings";
import {
  type CardPlace,
  type CardStep,
  cardPositionAt,
  cardStepTarget,
  cardsOf,
  dueState,
  indexAmongAll,
  isCardAt,
  labelsOf,
  newCardPosition,
} from "@/lib/cards";
import { checklistOf } from "@/lib/checklist";
import { cardCount, newColumnPosition, overLimit, positionAt } from "@/lib/columns";
import {
  type Lane,
  type LaneChange,
  type LaneContext,
  canChangeLane,
  laneChange,
  laneRows,
  laneStart,
} from "@/lib/lanes";
import { swatchClasses } from "@/lib/palette";
import { cardReminderAhead } from "@/lib/reminders";
import { useNow } from "@/lib/useNow";
import type { Selection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { useShortcut } from "@/lib/shortcuts";

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
    // The lowest one starting above the pointer (with swimlanes: the cell of the lane it is in).
    let lane: (typeof columns.droppableContainers)[number] | undefined;
    let top = -Infinity;
    for (const container of columns.droppableContainers) {
      const rect = args.droppableRects.get(container.id);
      if (!rect || pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || rect.top <= top) continue;
      lane = container;
      top = rect.top;
    }
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
  /** The names of each card's assignees (by card id). */
  assignees?: ReadonlyMap<string, string[]>;
  /** Whether a card passes the board filters; undefined without filters. */
  shown?: ((card: Row) => boolean) | undefined;
  onOpenCard: (card: Row) => void;
  /** Swimlanes (D-130): the lanes in order and what puts a card in one; undefined without. */
  lanes?: { list: readonly Lane[]; context: LaneContext } | undefined;
  // +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F6). The board's multi-select (cards by id).
  selection?: Selection;
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
  /** A cell of a swimlane (D-130); undefined: the column itself. */
  lane?: string | undefined;
}

/** A place in a column and, with swimlanes, the lane. */
type LanePlace = CardPlace & { lane?: string | undefined };

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
  shown,
  assignees,
  onOpenCard,
  lanes,
  selection,
}: BoardColumnsProps) {
  const { t } = useTranslation();
  const { default_color: defaultColor } = useSettings();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [dropAt, setDropAt] = useState<LanePlace | null>(null);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [announcement, setAnnouncement] = useState("");
  // +++===+++ 2026-11-12 00:03 +04 — Hasan Alizada — HAAL-174 (UAT finding F19, decision A). Listed in the "?" overlay; the focused
  // card handles the keys itself (CardTile).
  useShortcut({
    id: "kanban:card-move",
    keys: ["Alt+Up", "Alt+Down", "Alt+Left", "Alt+Right"],
    group: "items",
    label: "kanban.cards.moveKeys",
    enabled: canWrite,
  });
  const now = useNow();
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  // The card moved from the keyboard gets the focus back once it is in its new place.
  const refocus = useRef<{ id: string; position: string; lane?: string | undefined } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  const name = (row: Row) => String(row.name);
  // The rows with only the cards shown (places are counted among them).
  const visible = shown ? items.filter((item) => item.kind !== "card" || shown(item)) : items;
  const laneOf = (key: string | undefined) => (key === undefined ? undefined : lanes?.list.find((l) => l.key === key));
  // The rows shown in a lane (all shown ones without swimlanes).
  const rowsOf = (lane: Lane | undefined) => (lane && lanes ? laneRows(visible, lane, lanes.context) : visible);
  const laneName = (lane: Lane): string =>
    lane.kind === "priority"
      ? t(`priority.levels.${lane.value as Priority}`)
      : lane.value === null
        ? t(lane.kind === "assignee" ? "kanban.lanes.unassigned" : "kanban.lanes.noLabel")
        : lane.name;
  const toAll = (card: Row, place: LanePlace): CardPlace => ({
    columnId: place.columnId,
    index: indexAmongAll(items, rowsOf(laneOf(place.lane)), card, place.columnId, place.index),
  });
  const titleOf = (row: Row) => (typeof row.title === "string" ? row.title : "");
  const dragName = (data: DragData | undefined) =>
    data ? (data.type === "column" ? name(data.row) : titleOf(data.row)) : "";

  useEffect(() => {
    const want = refocus.current;
    if (!want || items.find((item) => item.id === want.id)?.position !== want.position) return;
    refocus.current = null;
    const lane = want.lane === undefined ? "" : `[data-lane="${want.lane}"]`;
    strip.current?.querySelector<HTMLElement>(`[data-card="${want.id}"]${lane}`)?.focus();
  }, [items]);

  function move(row: Row, index: number) {
    const from = active.findIndex((column) => column.id === row.id);
    if (index === from || index < 0 || index >= active.length) return;
    void updateColumn(user, row, "move", { position: positionAt(active, row, index) });
  }

  // `place` counts the cards shown (in its lane); `from` is the lane the card leaves.
  async function moveTo(card: Row, place: LanePlace, from?: string, keepFocus = false) {
    const to = laneOf(place.lane);
    const left = laneOf(from);
    let change: LaneChange | undefined;
    if (lanes && to && left && to.key !== left.key) {
      const next = laneChange(card, left, to, lanes.context);
      if (!next) return;
      change = next;
    }
    const target = toAll(card, place);
    if (!change && isCardAt(items, card, target)) return;
    const position = cardPositionAt(items, card, target.columnId, target.index);
    const column = active.find((row) => row.id === place.columnId);
    if (keepFocus) refocus.current = { id: String(card.id), position, lane: place.lane };
    const total = cardsOf(rowsOf(to), place.columnId).filter((row) => row.id !== card.id).length + 1;
    const ok = await moveCard(user, card, place.columnId, position, change);
    if (!ok) {
      refocus.current = null;
      return;
    }
    const values = { title: titleOf(card), column: column ? name(column) : "", position: place.index + 1, total };
    setAnnouncement(
      to ? t("kanban.cards.movedLane", { ...values, lane: laneName(to) }) : t("kanban.cards.moved", values),
    );
  }

  // Alt+arrows: within the card's lane.
  function step(card: Row, direction: CardStep, lane?: string) {
    const place = cardStepTarget(
      rowsOf(laneOf(lane)),
      active.map((row) => String(row.id)),
      card,
      direction,
    );
    if (place) void moveTo(card, { ...place, lane }, lane, true);
  }

  // Where a dragged card would go: before or after the card it is over (by the halves), or the end of a column.
  function placeOf(event: DragMoveEvent | DragEndEvent): LanePlace | null {
    const data = dragOf(event.active);
    const over = event.over;
    const drop = over?.data.current as DropData | undefined;
    if (data?.type !== "card" || !over || !drop) return null;
    if (lanes) {
      // Not on a column header, and not into a lane it may not go to (another label).
      const from = laneOf(data.lane);
      const to = laneOf(drop.lane);
      if (!from || !to || !canChangeLane(from, to)) return null;
    }
    const others = cardsOf(rowsOf(laneOf(drop.lane)), drop.columnId).filter((row) => row.id !== data.row.id);
    if (drop.type === "column") return { columnId: drop.columnId, index: others.length, lane: drop.lane };
    const at = others.findIndex((row) => row.id === drop.cardId);
    if (at < 0) return null; // over itself: it stays
    const moving = event.active.rect.current.translated;
    const below = moving !== null && moving.top + moving.height / 2 > over.rect.top + over.rect.height / 2;
    return { columnId: drop.columnId, index: at + (below ? 1 : 0), lane: drop.lane };
  }

  function onDragMove(event: DragMoveEvent) {
    const place = placeOf(event);
    const data = dragOf(event.active);
    const line =
      place && data?.type === "card" && (place.lane !== data.lane || !isCardAt(items, data.row, toAll(data.row, place)))
        ? place
        : null;
    setDropAt((was) =>
      was?.columnId === line?.columnId && was?.index === line?.index && was?.lane === line?.lane ? was : line,
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const data = dragOf(event.active);
    const drop = event.over?.data.current as DropData | undefined;
    const place = placeOf(event);
    setDragging(null);
    setDropAt(null);
    if (data?.type === "column" && drop?.type === "column") move(data.row, drop.index);
    else if (data?.type === "card" && place) void moveTo(data.row, place, data.lane);
    else if (data?.type === "card" && lanes?.list[0]?.kind === "label" && drop?.lane !== undefined) {
      if (drop.lane !== data.lane) setAnnouncement(t("kanban.lanes.labelStays"));
    }
  }

  // The cards of a column with the drop line where a dragged card would go.
  function cardList(columnId: string, lane?: Lane): ReactNode {
    const moving = dragging?.type === "card" ? dragging.row.id : null;
    const line = dropAt?.columnId === columnId && dropAt.lane === lane?.key ? dropAt.index : null;
    const nodes: ReactNode[] = [];
    let index = 0;
    const lineAt = (at: number) => {
      if (line === at) nodes.push(<DropLine key="drop-line" />);
    };
    for (const card of cardsOf(rowsOf(lane), columnId)) {
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
          assignees={assignees?.get(cardId) ?? []}
          lane={lane?.key}
          onOpen={() => {
            onOpenCard(card);
          }}
          select={
            selection
              ? {
                  selected: selection.isSelected(cardId),
                  toggle: (range) => {
                    selection.toggle(cardId, { range });
                  },
                  onClick: selection.rowProps(cardId, () => {
                    onOpenCard(card);
                  }).onClick,
                }
              : undefined
          }
          onStep={
            canWrite
              ? (direction) => {
                  step(card, direction, lane?.key);
                }
              : undefined
          }
        />,
      );
    }
    lineAt(index);
    return nodes.length > 0 ? <ul className="-my-1 flex flex-col">{nodes}</ul> : null;
  }

  // Which column a phone shows (the one whose left edge is nearest the strip's; measured on the screen, as with
  // swimlanes the headers sit in a row of their own).
  function onScroll() {
    const element = strip.current;
    if (!element) return;
    const left = element.getBoundingClientRect().left;
    const columns = [...element.querySelectorAll<HTMLElement>("[data-column]")];
    const distances = columns.map((column) => Math.abs(column.getBoundingClientRect().left - left));
    let best = 0;
    distances.forEach((distance, index) => {
      if (distance < (distances[best] ?? Infinity)) best = index;
    });
    setCurrent(best);
  }

  // The cards of a column (in a lane) and "+ Add card" — the new card gets the lane's value.
  function cellContent(row: Row, lane?: Lane): ReactNode {
    const columnId = String(row.id);
    const start = lane ? laneStart(lane) : {};
    return (
      <>
        {cardList(columnId, lane)}
        {canWrite ? (
          <AddCard
            columnName={lane ? t("kanban.lanes.cell", { column: name(row), lane: laneName(lane) }) : name(row)}
            onAdd={(title) =>
              createCard(
                user,
                {
                  boardId,
                  columnId,
                  title,
                  position: newCardPosition(items, columnId),
                  color: defaultColor,
                },
                // A new card has its title only: the filters may hide it.
                shown !== undefined &&
                  !shown({
                    id: "",
                    kind: "card",
                    title,
                    body: "",
                    priority: start.priority ?? "medium",
                    due_date: null,
                  }),
                start,
              )
            }
          />
        ) : null}
      </>
    );
  }

  const columnHeaders = active.map((row, index) => (
    <Column
      key={String(row.id)}
      row={row}
      index={index}
      count={cardCount(items, String(row.id))}
      shownCount={shown ? cardsOf(visible, String(row.id)).length : null}
      canWrite={canWrite}
      first={index === 0}
      last={index === active.length - 1}
      target={
        dragging?.type === "card" ? !lanes && dropAt?.columnId === row.id : dragging?.type === "column" ? null : false
      }
      cards={lanes ? null : cellContent(row)}
      onAction={(action) => {
        if (action === "left") move(row, index - 1);
        else if (action === "right") move(row, index + 1);
        else if (action === "archive")
          void updateColumn(user, row, "archive", { archived_at: new Date().toISOString() });
        else setDialog({ kind: action, row });
      }}
    />
  ));
  const addColumn = canWrite ? (
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
  ) : null;

  function laneRow(lane: Lane): ReactNode {
    const label = laneName(lane);
    const count = active.reduce((sum, row) => sum + cardsOf(rowsOf(lane), String(row.id)).length, 0);
    const open = !folded.has(lane.key);
    const title = t("kanban.lanes.toggle", { name: label, count });
    return (
      <section key={lane.key} aria-label={title} className="flex flex-col gap-1">
        <h2 className="sticky left-0 w-fit">
          <button
            type="button"
            aria-expanded={open}
            aria-label={title}
            onClick={() => {
              setFolded((was) => {
                const next = new Set(was);
                if (open) next.add(lane.key);
                else next.delete(lane.key);
                return next;
              });
            }}
            className="flex h-11 items-center gap-1.5 rounded-sm px-1 text-[13px] font-semibold hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary pointer-fine:md:h-8"
          >
            <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} aria-hidden />
            {lane.color ? (
              <span className={cn("size-2.5 rounded-full", swatchClasses(lane.color as Color))} aria-hidden />
            ) : null}
            <span>{label}</span>
            <span className="text-xs font-normal text-muted tabular-nums" aria-hidden>
              {count}
            </span>
          </button>
        </h2>
        {open ? (
          <div className="flex items-start gap-3">
            {active.map((row, index) => (
              <LaneCell
                key={String(row.id)}
                lane={lane.key}
                columnId={String(row.id)}
                index={index}
                label={t("kanban.lanes.cell", { column: name(row), lane: label })}
                target={
                  dragging?.type === "card"
                    ? dropAt?.columnId === row.id && dropAt?.lane === lane.key
                    : dragging?.type === "column"
                      ? null
                      : false
                }
              >
                {cellContent(row, lane)}
              </LaneCell>
            ))}
          </div>
        ) : null}
      </section>
    );
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
            lanes
              ? "flex min-h-0 flex-1 scroll-px-3 flex-col overflow-auto p-3 md:snap-none md:p-4"
              : "flex min-h-0 flex-1 scroll-px-3 items-start gap-3 overflow-x-auto p-3 md:snap-none md:p-4",
            // The snap would pull the strip back while a card is carried to the column beside.
            dragging ? "snap-none" : "snap-x snap-mandatory",
          )}
        >
          {lanes ? (
            <div className="flex w-max flex-col gap-3">
              <div className="sticky top-0 z-10 flex items-start gap-3 bg-bg">
                {columnHeaders}
                {addColumn}
              </div>
              {lanes.list.map(laneRow)}
            </div>
          ) : (
            <>
              {columnHeaders}
              {addColumn}
            </>
          )}
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
  /** The cards and "+ Add card"; null with swimlanes (the header only — the cards are in the lanes' cells). */
  cards: ReactNode;
  index: number;
  count: number;
  /** The cards shown under the board filters; null without filters. */
  shownCount: number | null;
  canWrite: boolean;
  first: boolean;
  last: boolean;
  onAction: (action: Action) => void;
}

function Column({ row, target, cards, index, count, shownCount, canWrite, first, last, onAction }: ColumnProps) {
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
        "flex w-[calc(100vw-1.5rem)] shrink-0 snap-start flex-col rounded-md border bg-surface md:w-68",
        cards !== null && "max-h-full",
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
        {shownCount !== null ? (
          <span className="text-xs text-muted tabular-nums">{t("kanban.filters.shown", { count: shownCount })}</span>
        ) : null}
        {canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                // HAAL-143 (D-127): 44 px on touch, compact with a mouse.
                className="size-7 shrink-0 pointer-coarse:size-11"
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
      {cards === null ? null : (
        <div className="relative flex min-h-16 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {count === 0 && !canWrite ? <p className="px-1 text-xs text-muted">{t("kanban.columns.noCards")}</p> : null}
          {cards}
        </div>
      )}
    </section>
  );
}

interface LaneCellProps {
  lane: string;
  columnId: string;
  index: number;
  /** "To do, High". */
  label: string;
  /** As for a column: a card would go into it, a column is dragged (marked when over), or neither. */
  target: boolean | null;
  children: ReactNode;
}

/** A column's cards in a swimlane (D-130): a drop target of its own. */
function LaneCell({ lane, columnId, index, label, target, children }: LaneCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${lane}-${columnId}`,
    data: { type: "column", index, columnId, lane } satisfies ColumnDropData,
  });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={cn(
        "flex min-h-16 w-[calc(100vw-1.5rem)] shrink-0 flex-col gap-2 rounded-md border border-line bg-surface px-2 py-2 md:w-68",
        (target ?? isOver) && "outline-2 outline-primary",
      )}
    >
      {children}
    </div>
  );
}
