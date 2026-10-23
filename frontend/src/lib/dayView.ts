// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. What the day view shows for one date (FR-CAL-01, D-61), from the
// rows in the local database:
// - one-off events whose days include the date, and occurrences of series on it (calendar.recurrence.v1);
// - the days an event covers are the viewer's (time.event_days.v1): a timed event is placed by its instants, so 23:00
//   in Berlin can land on the next day in Baku; occurrences are therefore expanded one day around the date;
// - times are shown in the viewer's zone; a timed event that started on an earlier day "continues", one that ends on
//   a later day "goes on";
// - the order is calendar.day_order.v1 (all-day, start, title — never colour).
import type { Color } from "@/api/generated/types.gen";
import { dayOrder } from "@/atoms/calendar/dayOrder";
import { occurrences } from "@/atoms/calendar/recurrence";
import { eventDays } from "@/atoms/time/eventDays";
import { localToUtc, wallClock } from "@/atoms/time/localToUtc";
import { addDays } from "@/lib/datetime";
import { log } from "@/lib/log";

export interface DayEntry {
  key: string;
  id: string;
  title: string;
  color: Color;
  location: string | null;
  allDay: boolean;
  recurring: boolean;
  /** Timed: started on an earlier day of the viewer. */
  continues: boolean;
  /** Timed: ends on a later day of the viewer. */
  goesOn: boolean;
  /** Timed: HH:MM in the viewer's zone (start on this day, end on the day it ends). */
  start: string | null;
  end: string | null;
}

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function local(epochMs: number, tzid: string): { date: string; time: string } {
  const w = wallClock(epochMs, tzid);
  return {
    date: `${String(w.year).padStart(4, "0")}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

const reported = new Set<string>();

function occurrenceDates(row: Row, start: string, rrule: string | null, date: string): string[] {
  if (rrule === null) return [start];
  try {
    return occurrences({ start_date: start, rrule, exceptions: [], from: addDays(date, -1), to: addDays(date, 1) });
  } catch (error) {
    // A rule this version cannot expand (e.g. written by a newer client): left out, reported once.
    const id = text(row.id) ?? "";
    if (!reported.has(id)) {
      reported.add(id);
      log.warn("day_view_rule_skipped", { error: error instanceof Error ? error.message : String(error) });
    }
    return [];
  }
}

/** The entries of `date` ("YYYY-MM-DD") for a viewer in `viewerTz`, in display order. */
export function entriesOn(rows: readonly Row[], date: string, viewerTz: string): DayEntry[] {
  const found: (DayEntry & { created_at: string })[] = [];
  for (const row of rows) {
    const [id, start, tzid] = [text(row.id), text(row.start_date), text(row.tzid)];
    if (row.kind !== "event" || row.deleted_at || !id || !start || !tzid) continue;
    const allDay = row.all_day !== false;
    const rrule = text(row.rrule);
    const [startTime, endTime] = [text(row.start_time), text(row.end_time)];
    if (!allDay && (startTime === null || endTime === null)) continue;
    for (const occurrence of occurrenceDates(row, start, rrule, date)) {
      const end = rrule === null ? (text(row.end_date) ?? occurrence) : occurrence;
      const times = {
        all_day: allDay,
        start_date: occurrence,
        end_date: end,
        start_time: startTime,
        end_time: endTime,
        tzid,
      };
      const days = eventDays(times, viewerTz);
      if (date < days.first_day || date > days.last_day) continue;
      let entry: Pick<DayEntry, "continues" | "goesOn" | "start" | "end"> = {
        continues: false,
        goesOn: false,
        start: null,
        end: null,
      };
      if (!allDay && startTime !== null && endTime !== null) {
        const from = local(Date.parse(localToUtc(occurrence, startTime, tzid).utc), viewerTz);
        const to = local(Date.parse(localToUtc(end, endTime, tzid).utc), viewerTz);
        entry = { continues: from.date < date, goesOn: to.date > date, start: from.time, end: to.time };
      }
      found.push({
        key: `${id}:${occurrence}`,
        id,
        title: text(row.title) ?? "",
        color: (text(row.color) ?? "brown") as Color,
        location: text(row.location),
        allDay,
        recurring: rrule !== null,
        ...entry,
        created_at: text(row.created_at) ?? "",
      });
    }
  }
  const order = dayOrder(
    found.map((e) => ({
      key: e.key,
      all_day: e.allDay,
      continues: e.continues,
      start: e.allDay ? null : e.start,
      title: e.title,
      created_at: e.created_at,
    })),
  );
  const byKey = new Map(found.map(({ created_at: created, ...shown }) => [shown.key, { shown, created }]));
  return order.flatMap((key) => {
    const entry = byKey.get(key);
    return entry ? [entry.shown] : [];
  });
}

/** The full date of the day view, e.g. "Thursday, October 22, 2026" (a date, so no time zone may shift it). */
export function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(
    Date.parse(`${date}T00:00:00Z`),
  );
}

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Header title: "Today" or the long date, and the weekday.
export function dateTitle(date: string, today: string, locale: string, todayLabel: string): string {
  if (date === today) return todayLabel;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    Date.parse(`${date}T00:00:00Z`),
  );
}

export function weekdayName(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(Date.parse(`${date}T00:00:00Z`));
}
