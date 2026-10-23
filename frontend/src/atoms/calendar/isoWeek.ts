// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Atom calendar.iso_week.v1 — TypeScript implementation (contract:
// atoms/calendar.iso_week.v1/contract.json). ISO 8601 weeks (Monday first, week 1 holds the first Thursday) of the
// given date — never of today. Computed on UTC midnights, so no time zone can shift the date.
export interface IsoWeek {
  week: number;
  week_year: number;
}

const DAY_MS = 86_400_000;

export function isoWeek(date: string): IsoWeek {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`not a date: ${date}`);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(ms + (3 - weekday) * DAY_MS);
  const weekYear = thursday.getUTCFullYear();
  const firstOfYear = Date.UTC(weekYear, 0, 1);
  return { week: Math.floor((thursday.getTime() - firstOfYear) / DAY_MS / 7) + 1, week_year: weekYear };
}
