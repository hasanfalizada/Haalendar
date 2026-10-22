// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Atom calendar.recurrence.v1 — TypeScript implementation (contract:
// atoms/calendar.recurrence.v1/contract.json). Dates only (FR-CAL-10): daily, weekly (weekday of the start), monthly
// (day of month; months without it are skipped), yearly (29 February only in leap years). Dates are "YYYY-MM-DD",
// computed on UTC midnights so no time zone can shift them; the first candidate is computed directly, so a series
// started years ago costs no more than one inside the window.
export interface RecurrenceInput {
  start_date: string;
  /** null = one-off event. */
  rrule: string | null;
  exceptions: readonly string[];
  from: string;
  to: string;
}

export const SUPPORTED_RRULES: ReadonlySet<string> = new Set([
  "FREQ=DAILY",
  "FREQ=WEEKLY",
  "FREQ=MONTHLY",
  "FREQ=YEARLY",
]);
const MAX_WINDOW_DAYS = 366;
const DAY_MS = 86_400_000;

export class RecurrenceError extends Error {
  constructor(readonly code: "UNSUPPORTED_RRULE" | "INVALID_WINDOW" | "WINDOW_TOO_LARGE") {
    super(code);
  }
}

export function isSupportedRrule(rrule: string | null): boolean {
  return rrule === null || SUPPORTED_RRULES.has(rrule);
}

function dayNumber(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`not a date: ${iso}`);
  return ms / DAY_MS;
}

function iso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-based here
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function* candidates(start: number, rrule: string | null, first: number, last: number): Generator<number> {
  const startDate = new Date(start * DAY_MS);
  const [month, dayOfMonth] = [startDate.getUTCMonth() + 1, startDate.getUTCDate()];
  if (rrule === null) {
    yield start;
  } else if (rrule === "FREQ=DAILY") {
    for (let day = first; day <= last; day += 1) yield day;
  } else if (rrule === "FREQ=WEEKLY") {
    for (let day = first + ((((start - first) % 7) + 7) % 7); day <= last; day += 7) yield day;
  } else if (rrule === "FREQ=MONTHLY") {
    const from = new Date(first * DAY_MS);
    let [y, m] = [from.getUTCFullYear(), from.getUTCMonth() + 1];
    while (dayNumber(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`) <= last) {
      if (dayOfMonth <= daysIn(y, m)) yield Date.UTC(y, m - 1, dayOfMonth) / DAY_MS;
      [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    }
  } else {
    const [firstYear, lastYear] = [new Date(first * DAY_MS).getUTCFullYear(), new Date(last * DAY_MS).getUTCFullYear()];
    for (let y = firstYear; y <= lastYear; y += 1) {
      if (month === 2 && dayOfMonth === 29 && !isLeap(y)) continue;
      yield Date.UTC(y, month - 1, dayOfMonth) / DAY_MS;
    }
  }
}

/** Occurrence dates inside [from, to], ascending, without exceptions. */
export function occurrences(input: RecurrenceInput): string[] {
  if (!isSupportedRrule(input.rrule)) throw new RecurrenceError("UNSUPPORTED_RRULE");
  const [start, from, to] = [dayNumber(input.start_date), dayNumber(input.from), dayNumber(input.to)];
  if (to < from) throw new RecurrenceError("INVALID_WINDOW");
  if (to - from > MAX_WINDOW_DAYS) throw new RecurrenceError("WINDOW_TOO_LARGE");
  const first = Math.max(start, from);
  if (first > to) return [];
  const skipped = new Set(input.exceptions);
  const dates: string[] = [];
  for (const day of candidates(start, input.rrule, first, to)) {
    const date = iso(day);
    if (day >= first && day <= to && !skipped.has(date)) dates.push(date);
  }
  return dates;
}
