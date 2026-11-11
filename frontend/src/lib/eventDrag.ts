// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Rescheduling by drag and drop (FR-CAL-28, C-04, D-78), without React:
// where a dropped event lands and what that writes. The grids work in the viewer's zone; events keep dates and
// wall-clock times in their own zone, so a drop is turned into the event's zone and the length stays as stored.
// - a drop on a day (month cell, all-day row) moves the event by whole days and keeps its times;
// - a drop on the time grid gives the new start in the viewer's zone (15-minute steps) and keeps the length;
// - an event: the changed dates and times; a series, "only this occurrence": a one-off copy at the new place with the
//   date excluded (D-67); "all occurrences": the series moves by the same days and to the new times, and so do its
//   excluded dates (the old ones are included again, the moved ones excluded).
import { localToUtc, wallClock } from "@/atoms/time/localToUtc";
import { addDays, daysBetween } from "@/lib/datetime";
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Extended rules (D-80): a series whose rule names its days (weekdays,
// Nth or last weekday, last day of month) moves as a whole only to other times on the same day (seriesMovable);
// otherwise its end date (UNTIL) moves along with the start.
import { exceptionsOf } from "@/lib/dayView";
import { eventData, followingForm, formFromRow } from "@/lib/eventForm";
import { shiftedRule } from "@/lib/repeatRule";
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-093. "This and following" (D-81): the series ends before the occurrence
// and a new series starts at the drop, moved like "all occurrences" (seriesMovable decides for both); the excluded
// dates from the occurrence on move along into the new series.
import { type SplitPlan, planSplit } from "@/lib/seriesSplit";

type Row = Record<string, unknown>;

export interface DropTarget {
  /** The day dropped on, in the viewer's zone. */
  day: string;
  /** Time grid only: the new start, minutes after midnight in the viewer's zone. */
  minutes?: number;
}

export interface EventTimes {
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const pad = (value: number) => String(value).padStart(2, "0");

function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** A wall-clock date and time moved by `minutes` (plain calendar arithmetic, no zone). */
function plus(date: string, time: string, minutes: number): { date: string; time: string } {
  const total = minutesOf(time) + minutes;
  const days = Math.floor(total / 1440);
  const rest = total - days * 1440;
  return { date: addDays(date, days), time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` };
}

/** The stored times of the event as shown on `occurrence` (its date in the event's zone). */
export function timesOf(row: Row, occurrence: string): EventTimes {
  const series = text(row.rrule) !== null;
  const start = series ? occurrence : (text(row.start_date) ?? occurrence);
  const storedEnd = text(row.end_date) ?? text(row.start_date) ?? occurrence;
  const span = series ? 0 : daysBetween(text(row.start_date) ?? start, storedEnd);
  return {
    start_date: start,
    start_time: row.all_day === false ? text(row.start_time) : null,
    end_date: addDays(start, span),
    end_time: row.all_day === false ? text(row.end_time) : null,
  };
}

/**
 * Where the event shown on `shownDay` (viewer) for `occurrence` lands when dropped on `target`, in the event's own
 * zone; null when it does not move.
 */
export function droppedTimes(
  row: Row,
  occurrence: string,
  shownDay: string,
  target: DropTarget,
  viewerTz: string,
): EventTimes | null {
  const now = timesOf(row, occurrence);
  const tzid = text(row.tzid) ?? viewerTz;
  let next: EventTimes;
  if (target.minutes !== undefined && now.start_time !== null && now.end_time !== null) {
    const start = `${pad(Math.floor(target.minutes / 60))}:${pad(target.minutes % 60)}`;
    const at = wallClock(Date.parse(localToUtc(target.day, start, viewerTz).utc), tzid);
    const startDate = `${String(at.year).padStart(4, "0")}-${pad(at.month)}-${pad(at.day)}`;
    const startTime = `${pad(at.hour)}:${pad(at.minute)}`;
    const length =
      daysBetween(now.start_date, now.end_date) * 1440 + minutesOf(now.end_time) - minutesOf(now.start_time);
    const end = plus(startDate, startTime, length);
    next = { start_date: startDate, start_time: startTime, end_date: end.date, end_time: end.time };
  } else {
    const days = daysBetween(shownDay, target.day);
    next = { ...now, start_date: addDays(now.start_date, days), end_date: addDays(now.end_date, days) };
  }
  const same =
    next.start_date === now.start_date &&
    next.start_time === now.start_time &&
    next.end_date === now.end_date &&
    next.end_time === now.end_time;
  return same ? null : next;
}

export type DragScope = "this" | "following" | "all";

export type DragPlan =
  | { kind: "shift"; id: string; version: number | null; base: Row; data: Row; exceptions?: never }
  | { kind: "occurrence"; series: string; date: string; copy: Row }
  | {
      kind: "series";
      id: string;
      version: number | null;
      base: Row;
      data: Row;
      /** Excluded dates that move along: each `from` is included again, each `to` excluded. */
      exceptions: { from: string; to: string }[];
    }
  | SplitPlan;

function changed(row: Row, next: EventTimes): { base: Row; data: Row } {
  const base: Row = {};
  const data: Row = {};
  for (const [name, value] of Object.entries(next)) {
    const before = row[name] ?? null;
    if (before !== value) {
      base[name] = before;
      data[name] = value;
    }
  }
  return { base, data };
}

/** Whether "all occurrences" can take this drop: the rule still means the same from the moved start. */
export function seriesMovable(row: Row, occurrence: string, next: EventTimes): boolean {
  const rrule = text(row.rrule);
  return rrule === null || shiftedRule(rrule, daysBetween(occurrence, next.start_date)) !== null;
}

/** The writes of a drop: `next` from droppedTimes; `scope` only matters for a series. */
export function planDrop(row: Row, occurrence: string, next: EventTimes, scope: DragScope): DragPlan {
  const id = String(row.id);
  const version = typeof row.version === "number" ? row.version : null;
  if (text(row.rrule) === null) return { kind: "shift", id, version, ...changed(row, next) };
  if (scope === "this") {
    return {
      kind: "occurrence",
      series: id,
      date: occurrence,
      copy: {
        kind: "event",
        container_kind: "calendar",
        container_id: row.container_id,
        ...(text(row.tzid) ? { tzid: row.tzid } : {}),
        ...eventData(formFromRow(row, occurrence)),
        ...next,
      },
    };
  }
  if (scope === "following") {
    const days = daysBetween(occurrence, next.start_date);
    const later = eventData(followingForm(row, occurrence));
    return planSplit(
      row,
      occurrence,
      {
        kind: "event",
        container_kind: "calendar",
        container_id: row.container_id,
        ...(text(row.tzid) ? { tzid: row.tzid } : {}),
        ...later,
        ...next,
        end_date: next.start_date,
        rrule: shiftedRule(text(later.rrule) ?? "", days),
      },
      days,
    );
  }
  // The whole series: its stored start moves by the days the occurrence moved; a series lasts one day.
  const days = daysBetween(occurrence, next.start_date);
  const start = addDays(text(row.start_date) ?? occurrence, days);
  const series: EventTimes = {
    start_date: start,
    start_time: next.start_time,
    end_date: start,
    end_time: next.end_time,
  };
  const { base, data } = changed(row, series);
  const rrule = shiftedRule(text(row.rrule) ?? "", days);
  if (rrule !== null && rrule !== row.rrule) {
    base.rrule = row.rrule;
    data.rrule = rrule;
  }
  return {
    kind: "series",
    id,
    version,
    base,
    data,
    exceptions: days === 0 ? [] : exceptionsOf(row).map((from) => ({ from, to: addDays(from, days) })),
  };
}
