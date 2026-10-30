// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards of a board (FR-KAN-03, D-92) from the local rows: the live cards
// of a column top to bottom (position, then title), the position of a new card (after every card of the column), the
// live labels on a card (in the board's label order), and the due date as shown on a card — "Nov 10" or
// "Nov 10, 09:30" (the year only when it is not this year).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. Moving a card (FR-KAN-04): the position that puts it at a place in a
// column, and where Alt+arrow takes it — one up or down in its column, or the same place (the end when shorter) in the
// column to the left or right.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-117. Whether a card is overdue or due soon (FR-KAN-08, D-95): with a due
// time, due soon within 24 hours before it and overdue from it on; a date alone is the whole day — due soon on that day,
// overdue from the next one. Read in the given zone (the reader's).
import { localToUtc } from "@/atoms/time/localToUtc";

import { positionAt } from "./columns";
import { addDays } from "./datetime";
import { clockText } from "./dayView";
import { comparePositions, keyBetween } from "./position";

type Row = Record<string, unknown>;

const positionOf = (row: Row) => (typeof row.position === "string" ? row.position : "");
const textOf = (value: unknown) => (typeof value === "string" ? value : "");

export function cardsOf(items: readonly Row[], columnId: string): Row[] {
  return items
    .filter((item) => item.kind === "card" && item.column_id === columnId && !item.deleted_at)
    .sort((a, b) => comparePositions(positionOf(a), positionOf(b)) || textOf(a.title).localeCompare(textOf(b.title)));
}

/** After every card of the column, deleted ones too (their places are kept for a restore). */
export function newCardPosition(items: readonly Row[], columnId: string): string {
  const last = items
    .filter((item) => item.kind === "card" && item.column_id === columnId)
    .map(positionOf)
    .reduce<string>((highest, key) => (comparePositions(key, highest) > 0 ? key : highest), "");
  return keyBetween(last, null);
}

/** The live labels on a card, in the order of the board's labels (name). */
export function labelsOf(cardId: string, itemLabels: readonly Row[], labels: readonly Row[]): Row[] {
  const on = new Set(
    itemLabels.filter((row) => row.item_id === cardId && !row.deleted_at).map((row) => String(row.label_id)),
  );
  return labels
    .filter((label) => on.has(String(label.id)) && !label.deleted_at)
    .sort((a, b) => textOf(a.name).localeCompare(textOf(b.name)));
}

/** The due date of a card as text, or null without one. */
export function dueText(
  card: Row,
  locale: string,
  timeFormat: "12h" | "24h",
  thisYear: number = new Date().getFullYear(),
): string | null {
  const day = textOf(card.due_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const sameYear = Number(day.slice(0, 4)) === thisYear;
  const date = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(Date.parse(`${day}T00:00:00Z`));
  const time = textOf(card.due_time);
  return /^\d{2}:\d{2}$/.test(time) ? `${date}, ${clockText(time, locale, timeFormat)}` : date;
}

/** A place in a column: the index among its live cards, counted without the card being moved. */
export interface CardPlace {
  columnId: string;
  index: number;
}

export type CardStep = "up" | "down" | "left" | "right";

/** The position that puts `moving` at `index` among the live cards of the column (counted without it). */
export function cardPositionAt(items: readonly Row[], moving: Row, columnId: string, index: number): string {
  return positionAt(cardsOf(items, columnId), moving, index);
}

/** Whether the card is at that place already (nothing to move). */
export function isCardAt(items: readonly Row[], card: Row, place: CardPlace): boolean {
  return (
    card.column_id === place.columnId &&
    cardsOf(items, place.columnId).findIndex((row) => row.id === card.id) === place.index
  );
}

/** Where Alt+arrow takes the card among the active columns (left to right); null at an edge. */
export function cardStepTarget(
  items: readonly Row[],
  columnIds: readonly string[],
  card: Row,
  step: CardStep,
): CardPlace | null {
  const columnId = String(card.column_id);
  const index = cardsOf(items, columnId).findIndex((row) => row.id === card.id);
  const column = columnIds.indexOf(columnId);
  if (index < 0 || column < 0) return null;
  if (step === "up") return index > 0 ? { columnId, index: index - 1 } : null;
  if (step === "down") {
    return index < cardsOf(items, columnId).length - 1 ? { columnId, index: index + 1 } : null;
  }
  const next = columnIds[column + (step === "left" ? -1 : 1)];
  if (next === undefined) return null;
  return { columnId: next, index: Math.min(index, cardsOf(items, next).length) };
}

export type DueState = "overdue" | "soon" | null;

const DAY_MS = 86_400_000;

/** Overdue, due soon (within 24 hours) or neither — the card's due date read in `timeZone` at `now` (ms). */
export function dueState(card: Row, timeZone: string, now: number): DueState {
  const day = textOf(card.due_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = textOf(card.due_time);
  const instant = (date: string, clock: string) => Date.parse(localToUtc(date, clock, timeZone).utc);
  if (/^\d{2}:\d{2}$/.test(time)) {
    const due = instant(day, time);
    return now >= due ? "overdue" : now >= due - DAY_MS ? "soon" : null;
  }
  if (now >= instant(addDays(day, 1), "00:00")) return "overdue";
  return now >= instant(day, "00:00") ? "soon" : null;
}
