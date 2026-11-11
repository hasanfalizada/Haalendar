// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-082, D-71. Day Number (FR-CAL-22): the ordinal day of a calendar date
// in its year, 1..365 (1..366 in a leap year). Pure calendar arithmetic on the YYYY-MM-DD date, no time zone involved,
// so the number is the same for every viewer of that date. Kept in the client: only the header shows it; move it to an
// atom if the server ever needs it (export, API).

/** The day of the year of `date` (YYYY-MM-DD) and the number of days in that year. */
export function dayOfYear(date: string): { day: number; daysInYear: number } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const dayOfMonth = Number(date.slice(8, 10));
  const startOfYear = Date.UTC(year, 0, 1);
  const day = (Date.UTC(year, month - 1, dayOfMonth) - startOfYear) / 86_400_000 + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - startOfYear) / 86_400_000;
  return { day, daysInYear };
}
