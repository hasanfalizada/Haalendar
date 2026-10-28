// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Agenda (FR-CAL-27, C-03, D-77): the days from the selected date on, as
// many as the user's setting says (1 to 365, default 30), with the events of each day; days without events are left
// out.
import { addDays } from "@/lib/datetime";
import { type DayEntry, entriesOnDays } from "@/lib/dayView";

type Row = Record<string, unknown>;

/** The `count` dates from `from` on. */
export function agendaDays(from: string, count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => addDays(from, i));
}

/** The days of `days` that have events, each with its events in the day order. */
export function agendaOf(
  rows: readonly Row[],
  days: readonly string[],
  viewerTz: string,
): { day: string; entries: DayEntry[] }[] {
  const byDay = entriesOnDays(rows, days, viewerTz);
  return days.flatMap((day) => {
    const entries = byDay.get(day) ?? [];
    return entries.length > 0 ? [{ day, entries }] : [];
  });
}
