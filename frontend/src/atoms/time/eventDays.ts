// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Atom time.event_days.v1 — TypeScript implementation (contract:
// atoms/time.event_days.v1/contract.json). Depends on time.local_to_utc.v1 (manifest deps).
import { localToUtc, validateZone, wallClock } from "./localToUtc";

export interface EventTimes {
  all_day: boolean;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  tzid: string;
}

export interface EventDays {
  first_day: string;
  last_day: string;
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function eventDays(event: EventTimes, viewerTzid: string): EventDays {
  validateZone(viewerTzid);
  if (event.all_day) {
    validateZone(event.tzid);
    return { first_day: event.start_date, last_day: event.end_date };
  }
  if (event.start_time === null || event.end_time === null) {
    throw new Error("timed events need start_time and end_time");
  }
  const start = Date.parse(localToUtc(event.start_date, event.start_time, event.tzid).utc);
  const end = Date.parse(localToUtc(event.end_date, event.end_time, event.tzid).utc);
  const s = wallClock(start, viewerTzid);
  const e = wallClock(end, viewerTzid);
  const firstDay = isoDate(s.year, s.month, s.day);
  // Ending exactly at local midnight does not occupy that day.
  const atMidnight = end > start && e.hour === 0 && e.minute === 0 && e.second === 0;
  const lastDay = isoDate(e.year, e.month, e.day - (atMidnight ? 1 : 0));
  return { first_day: firstDay, last_day: lastDay < firstDay ? firstDay : lastDay };
}
