// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. What the day view shows for one date (FR-CAL-01, D-61), from the
// rows in the local database:
// - one-off events whose days include the date, and occurrences of series on it (calendar.recurrence.v1);
// - the days an event covers are the viewer's (time.event_days.v1): a timed event is placed by its instants, so 23:00
//   in Berlin can land on the next day in Baku; occurrences are therefore expanded one day around the date;
// - times are shown in the viewer's zone; a timed event that started on an earlier day "continues", one that ends on
//   a later day "goes on";
// - the order is calendar.day_order.v1 (all-day, start, title — never colour).
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. Excluded dates of a series (`exceptions`, D-67) are left out; the
// effective start of a series is its first occurrence that is not excluded (F-23), derived only.
import type { Color } from "@/api/generated/types.gen";
import { dayOrder } from "@/atoms/calendar/dayOrder";
import { occurrences } from "@/atoms/calendar/recurrence";
import { eventDays } from "@/atoms/time/eventDays";
import { localToUtc, wallClock } from "@/atoms/time/localToUtc";
import { addDays } from "@/lib/datetime";
import { log } from "@/lib/log";
import { toPlainText } from "@/lib/markdown-text";

export interface DayEntry {
  key: string;
  id: string;
  title: string;
  color: Color;
  location: string | null;
  allDay: boolean;
  recurring: boolean;
  /** HAAL-083: the description has visible text once its Markdown is stripped (D-72). */
  hasDescription: boolean;
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

/** The excluded dates of a series row. */
export function exceptionsOf(row: Row): string[] {
  return Array.isArray(row.exceptions) ? row.exceptions.filter((day): day is string => typeof day === "string") : [];
}

// Whole windows of the recurrence atom searched for the effective start (as on the server).
const LOOKAHEAD_WINDOWS = 5;

/** Where a series starts for the user: its first occurrence that is not excluded (F-23); the stored start otherwise. */
export function effectiveStart(start: string, rrule: string | null, exceptions: readonly string[]): string {
  if (rrule === null || exceptions.length === 0) return start;
  let from = start;
  try {
    for (let window = 0; window < LOOKAHEAD_WINDOWS; window += 1) {
      const to = addDays(from, 366);
      const found = occurrences({ start_date: start, rrule, exceptions: [...exceptions], from, to });
      if (found[0] !== undefined) return found[0];
      from = addDays(to, 1);
    }
  } catch {
    // A rule this version cannot expand: the stored start stays.
  }
  return start;
}

function occurrenceDates(row: Row, start: string, rrule: string | null, date: string): string[] {
  if (rrule === null) return [start];
  try {
    const exceptions = exceptionsOf(row);
    return occurrences({ start_date: start, rrule, exceptions, from: addDays(date, -1), to: addDays(date, 1) });
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
        hasDescription: toPlainText(text(row.body) ?? "", { singleLine: true }).trim() !== "",
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

// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. The entries of many days at once (agenda, month, week): a one-off
// event is only looked at on its stored dates and one day around them (the margin catches zone shifts, as entriesOn
// expands series one day around the date), a series on every day; entriesOn still decides. 365 agenda days with 300
// events went from about 2.8 s to about 0.3 s (series stay the main cost).
export function entriesOnDays(
  rows: readonly Row[],
  days: readonly string[],
  viewerTz: string,
): Map<string, DayEntry[]> {
  const wanted = new Set(days);
  const [first = "", last = ""] = [days[0], days[days.length - 1]];
  const series: Row[] = [];
  const oneOffs = new Map<string, Row[]>();
  for (const row of rows) {
    const start = text(row.start_date);
    if (row.kind !== "event" || row.deleted_at || !start) continue;
    if (text(row.rrule)) {
      series.push(row);
      continue;
    }
    const end = text(row.end_date) ?? start;
    const from = addDays(start, -1) < first ? first : addDays(start, -1);
    const to = addDays(end, 1) > last ? last : addDays(end, 1);
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!wanted.has(day)) continue;
      const list = oneOffs.get(day);
      if (list) list.push(row);
      else oneOffs.set(day, [row]);
    }
  }
  return new Map(days.map((day) => [day, entriesOn([...series, ...(oneOffs.get(day) ?? [])], day, viewerTz)]));
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

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. A wall-clock time ("HH:MM") in the 12/24-hour setting (list and
// editor share it).
export function clockText(hhmm: string, locale: string, timeFormat: "12h" | "24h"): string {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
  }).format(Date.UTC(2000, 0, 1, hour, minute));
}

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. The date range of one occurrence for the details card: all-day events
// as dates ("Oct 27 – 29, 2026"), timed ones as instants in the viewer's zone and 12/24-hour setting, the browser
// collapsing what both ends share ("Oct 27, 2026, 11:00 – 12:00").
export function eventRange(
  row: Record<string, unknown>,
  occurrence: string,
  viewerTz: string,
  locale: string,
  timeFormat: "12h" | "24h",
): string {
  const recurring = typeof row.rrule === "string";
  const endDate = recurring ? occurrence : typeof row.end_date === "string" ? row.end_date : occurrence;
  const startDate = recurring ? occurrence : typeof row.start_date === "string" ? row.start_date : occurrence;
  const [startTime, endTime, tzid] = [row.start_time, row.end_time, row.tzid];
  if (
    row.all_day !== false ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    typeof tzid !== "string"
  ) {
    const days = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
    const [from, to] = [Date.parse(`${startDate}T00:00:00Z`), Date.parse(`${endDate}T00:00:00Z`)];
    return from === to ? days.format(from) : days.formatRange(from, to);
  }
  const instants = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: viewerTz,
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
  });
  const from = Date.parse(localToUtc(startDate, startTime, tzid).utc);
  const to = Date.parse(localToUtc(endDate, endTime, tzid).utc);
  return from === to ? instants.format(from) : instants.formatRange(from, to);
}
