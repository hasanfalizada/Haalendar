// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. Month view (FR-CAL-26, C-02, D-76), the parts without React:
// - only the weeks the month touches (4 to 6), from the user's week start;
// - how many events a day cell shows: all when they fit, otherwise one place less and "+N more" in the last one;
// - the title ("October 2026").
import { addDays } from "@/lib/datetime";

import { weekStartOf } from "./monthGrid";

/** The weeks (7 dates each) that hold a day of `month` ("YYYY-MM"). */
export function monthWeeks(month: string, weekStart: number): string[][] {
  const weeks: string[][] = [];
  for (let first = weekStartOf(`${month}-01`, weekStart); first.slice(0, 7) <= month; first = addDays(first, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(first, i)));
  }
  return weeks;
}

/** Events shown in a cell with room for `slots` lines, and how many go into "+N more". */
export function fitInCell(total: number, slots: number): { shown: number; more: number } {
  const room = Math.max(1, slots);
  if (total <= room) return { shown: total, more: 0 };
  return { shown: room - 1, more: total - (room - 1) };
}

/** "October 2026" in the interface language. */
export function monthTitle(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.parse(`${month}-01T00:00:00Z`),
  );
}
