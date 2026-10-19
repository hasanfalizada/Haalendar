// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Atom calendar.week_ab_label.v1 — TypeScript implementation
// (contract: atoms/calendar.week_ab_label.v1/contract.json). Weeks are cut by the user's week start and counted from the
// anchor week, so the label is right across year boundaries and 53-week years; ISO week parity is never used. Dates
// are local calendar dates ("YYYY-MM-DD"), computed on UTC midnights so no time zone can shift them.
export interface WeekAbInput {
  date: string;
  anchor: string;
  /** 0 = Sunday … 6 = Saturday. */
  week_start: number;
  labels: readonly [string, string];
}

export interface WeekAbLabel {
  label: string;
  index: 0 | 1;
  weeks_from_anchor: number;
}

export class LabelsNotDistinctError extends Error {
  readonly code = "LABELS_NOT_DISTINCT";
  constructor() {
    super("labels must differ");
  }
}

const DAY_MS = 86_400_000;

function utcDay(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`not a date: ${iso}`);
  return ms / DAY_MS;
}

/** Days since 1970-01-01 of the latest day on or before `iso` whose weekday is `weekStart`. */
export function weekStartOf(iso: string, weekStart: number): number {
  if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) throw new Error("week_start must be 0..6");
  const day = utcDay(iso);
  const weekday = new Date(day * DAY_MS).getUTCDay(); // 0 = Sunday, as in the contract
  return day - ((weekday - weekStart + 7) % 7);
}

export function labelWeek(input: WeekAbInput): WeekAbLabel {
  const [first, second] = input.labels;
  if (first.toLocaleLowerCase("en") === second.toLocaleLowerCase("en")) throw new LabelsNotDistinctError();
  const weeks = (weekStartOf(input.date, input.week_start) - weekStartOf(input.anchor, input.week_start)) / 7;
  const index = (((weeks % 2) + 2) % 2) as 0 | 1; // mathematical (non-negative) modulo
  return { label: index === 0 ? first : second, index, weeks_from_anchor: weeks };
}
