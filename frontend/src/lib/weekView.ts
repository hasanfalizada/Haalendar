// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. Week view (FR-CAL-25, C-01, D-75), the parts without React:
// - the 7 days of the week that holds a date, from the user's week start;
// - the timed events of one day as blocks on a 24-hour axis: an event that started on an earlier day begins at 00:00,
//   one that goes on ends at 24:00 (the day list's continues / goes on); events that overlap — counting each at least
//   MIN_MINUTES long, the height it is drawn with — stand side by side: each group of overlapping events gets as many
//   columns as it needs at most, each event the first free column from the left;
// - the title of the week ("October 26 – November 1, 2026").
import { addDays } from "@/lib/datetime";
import type { DayEntry } from "@/lib/dayView";

export const DAY_MINUTES = 24 * 60;
/** The shortest block drawn (minutes): a 15-minute or zero-length event still shows its title. */
export const MIN_MINUTES = 30;

/** The 7 dates ("YYYY-MM-DD") of the week holding `date`; `weekStart` 0 = Sunday … 6 = Saturday. */
export function weekDays(date: string, weekStart: number): string[] {
  const weekday = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
  const first = addDays(date, -((weekday - weekStart + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

export interface TimedBlock {
  entry: DayEntry;
  /** Minutes after midnight of the day (viewer's zone). */
  start: number;
  end: number;
  /** 0-based column and the number of columns of its overlap group. */
  column: number;
  columns: number;
}

function minutes(hhmm: string | null, fallback: number): number {
  if (hhmm === null) return fallback;
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** The timed entries of one day placed on the day's axis, overlapping ones side by side. */
export function layoutDay(entries: readonly DayEntry[]): TimedBlock[] {
  const blocks = entries
    .filter((entry) => !entry.allDay && entry.start !== null && entry.end !== null)
    .map((entry) => {
      const start = entry.continues ? 0 : minutes(entry.start, 0);
      const end = entry.goesOn ? DAY_MINUTES : Math.max(minutes(entry.end, start), start);
      return { entry, start, end, column: 0, columns: 1 };
    })
    // Earlier first, then longer first (a long event keeps the left column); the list order breaks ties.
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const drawnEnd = (block: TimedBlock) => Math.max(block.end, block.start + MIN_MINUTES);

  let group: TimedBlock[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  const close = () => {
    for (const block of group) block.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };
  for (const block of blocks) {
    if (block.start >= groupEnd) close();
    let column = columnEnds.findIndex((end) => end <= block.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = drawnEnd(block);
    block.column = column;
    group.push(block);
    groupEnd = Math.max(groupEnd, drawnEnd(block));
  }
  close();
  return blocks;
}

/** "October 26 – November 1, 2026": the first to the last of `days` in the interface language (also the agenda). */
export function rangeTitle(days: readonly string[], locale: string): string {
  const [first = "", last = first] = [days[0], days[days.length - 1]];
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(Date.parse(`${first}T00:00:00Z`), Date.parse(`${last}T00:00:00Z`));
}
