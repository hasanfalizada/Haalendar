// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. Dates of the mini month calendar (FR-CAL-02): always six weeks
// (42 days, so the height never jumps) starting on the user's first day of the week (0 = Sunday … 6 = Saturday).
// Plain calendar dates ("YYYY-MM-DD", months "YYYY-MM") computed on UTC midnights, so no time zone can shift them.
import { addDays } from "@/lib/datetime";

const DAY_MS = 86_400_000;

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** `month` ("YYYY-MM") moved by `months`. */
export function addMonths(month: string, months: number): string {
  const [year = 0, m = 1] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, m - 1 + months, 1));
  return moved.toISOString().slice(0, 7);
}

/** The same day of month in `month`, or its last day when the month is shorter. */
export function sameDayIn(date: string, month: string): string {
  const [year = 0, m = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDay();
}

/** First day of the week that contains `date`. */
export function weekStartOf(date: string, weekStart: number): string {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

/** The 42 dates shown for `month`. */
export function monthGrid(month: string, weekStart: number): string[] {
  const first = weekStartOf(`${month}-01`, weekStart);
  const start = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
}

/** Weekday indexes (0 = Sunday) in display order. */
export function weekdayOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
}
