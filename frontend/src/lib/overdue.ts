// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-068. Overdue counter (FR-CAL-17, F-32, D-68), the legacy rule: active
// one-off events whose start day is before today, plus active series whose effective start (FR-CAL-14) is before
// today — a series that has begun counts every day after, as in the legacy app. "Today" and the start day of a timed
// event are the viewer's (the day view places events the same way); an all-day event's own date counts.
import { localToUtc, wallClock } from "@/atoms/time/localToUtc";

import { effectiveStart, exceptionsOf } from "./dayView";

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function viewerDay(date: string, time: string, tzid: string, viewerTz: string): string {
  const w = wallClock(Date.parse(localToUtc(date, time, tzid).utc), viewerTz);
  return `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** The day an event starts for the viewer; for a series its effective start. Null when the row is not an event. */
export function startDayOf(row: Row, viewerTz: string): string | null {
  const start = text(row.start_date);
  if (row.kind !== "event" || !start) return null;
  const rrule = text(row.rrule);
  if (rrule) return effectiveStart(start, rrule, exceptionsOf(row));
  const [time, tzid] = [text(row.start_time), text(row.tzid)];
  if (row.all_day !== false || !time || !tzid) return start;
  try {
    return viewerDay(start, time, tzid, viewerTz);
  } catch {
    return start; // an unknown zone: its own date
  }
}

/** How many active events are overdue on `today` ("YYYY-MM-DD", the viewer's). */
export function overdueCount(rows: readonly Row[], today: string, viewerTz: string): number {
  let count = 0;
  for (const row of rows) {
    if (row.deleted_at) continue;
    const day = startDayOf(row, viewerTz);
    if (day !== null && day < today) count += 1;
  }
  return count;
}
