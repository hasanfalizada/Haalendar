// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. Time blocking (FR-INT-04, C-11, D-99), without React:
// - what the "Notes & cards" panel offers: live notes (not archived) and live cards on live boards the user reads
//   (with the board's name), found by title or text; those with a due date first, the nearest first, then by title;
// - whether an item is already time-blocked (a live link of origin time_block to it);
// - the event a drop makes: the item's title, at the dropped time for an hour (an all-day event on the all-day row),
//   in the default calendar and colour; and the start "Schedule…" offers (the next quarter hour today, else 09:00).
import { addDays } from "./datetime";
import { type EventForm, newEventForm } from "./eventForm";

type Row = Record<string, unknown>;

export type ScheduleKind = "note" | "card";

export interface Schedulable {
  row: Row;
  kind: ScheduleKind;
  /** The board's name for a card. */
  boardName: string | null;
  /** "YYYY-MM-DD" or null. */
  due: string | null;
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");
const BLOCK_MINUTES = 60;

function dueOf(row: Row): string | null {
  const due = textOf(row.due_date) || textOf(row.due_at).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
}

export function schedulable(
  items: readonly Row[],
  boards: readonly Row[],
  kind: ScheduleKind,
  query: string,
): Schedulable[] {
  const live = new Map(
    boards.filter((board) => !board.deleted_at && !board.archived_at).map((board) => [board.id, textOf(board.name)]),
  );
  const needle = query.trim().toLocaleLowerCase();
  return items
    .filter((row) => {
      if (row.kind !== kind || row.deleted_at) return false;
      if (kind === "note" && row.archived_at) return false;
      if (kind === "card" && !live.has(row.container_id)) return false;
      return !needle || `${textOf(row.title)}\n${textOf(row.body)}`.toLocaleLowerCase().includes(needle);
    })
    .map((row) => ({
      row,
      kind,
      boardName: kind === "card" ? (live.get(row.container_id) ?? null) : null,
      due: dueOf(row),
    }))
    .sort((a, b) => {
      if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due.localeCompare(b.due);
      return textOf(a.row.title).localeCompare(textOf(b.row.title));
    });
}

/** Whether the item has a live time-block link (an event made from it). */
export function isTimeBlocked(links: readonly Row[], itemId: string): boolean {
  return links.some(
    (link) =>
      !link.deleted_at && link.origin === "time_block" && (link.from_item_id === itemId || link.to_item_id === itemId),
  );
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The event form of a block: `minutes` after midnight on `day` for an hour (across midnight onto the next day), or
 * the whole day when `minutes` is undefined.
 */
export function blockForm(
  title: string,
  day: string,
  minutes: number | undefined,
  color: string,
  calendarId: string,
): EventForm {
  const form = { ...newEventForm(day, color, calendarId), title: title.slice(0, 200) };
  if (minutes === undefined) return form;
  const end = minutes + BLOCK_MINUTES;
  return {
    ...form,
    all_day: "false",
    start_time: hhmm(minutes),
    end_time: hhmm(end),
    end_date: end >= 24 * 60 ? addDays(day, 1) : day,
  };
}

/** Where "Schedule…" starts: the next quarter hour on `day` when it is today (`nowMinutes`), else 09:00. */
export function suggestedStart(day: string, today: string, nowMinutes: number): number {
  if (day !== today) return 9 * 60;
  return Math.min(Math.ceil((nowMinutes + 1) / 15) * 15, 24 * 60 - 15);
}
