// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards of a board (FR-KAN-03, D-92) from the local rows: the live cards
// of a column top to bottom (position, then title), the position of a new card (after every card of the column), the
// live labels on a card (in the board's label order), and the due date as shown on a card — "Nov 10" or
// "Nov 10, 09:30" (the year only when it is not this year).
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
