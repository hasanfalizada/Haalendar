// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Agenda (FR-CAL-27, C-03, D-77): the days from the selected date on, as
// many as the user's setting says (1 to 365, default 30), with the events of each day; days without events are left
// out.
// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-121. With the due dates of notes and cards (layers, D-122): a day with only those is shown too.
import type { DayOrderBy } from "@/atoms/calendar/dayOrder";
import { addDays } from "@/lib/datetime";
import { type DayEntry, entriesOnDays } from "@/lib/dayView";
import type { DueEntry } from "@/lib/dueLayers";

type Row = Record<string, unknown>;

/** The `count` dates from `from` on. */
export function agendaDays(from: string, count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => addDays(from, i));
}

/** The days of `days` that have events or due dates, each with its events in the day order and its due dates. */
export function agendaOf(
  rows: readonly Row[],
  days: readonly string[],
  viewerTz: string,
  by: DayOrderBy = "time",
  duesByDay: ReadonlyMap<string, DueEntry[]> = new Map(),
): { day: string; entries: DayEntry[]; dues: DueEntry[] }[] {
  const byDay = entriesOnDays(rows, days, viewerTz, by);
  return days.flatMap((day) => {
    const entries = byDay.get(day) ?? [];
    const dues = duesByDay.get(day) ?? [];
    return entries.length + dues.length > 0 ? [{ day, entries, dues }] : [];
  });
}
