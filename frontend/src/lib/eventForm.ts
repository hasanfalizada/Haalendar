// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. The event editor's form (FR-CAL-06/07, F-10/F-11/F-13, D-64), kept as
// plain strings so it is also its own draft (drafts hold strings):
// - defaults for a new event: the day shown, all-day on, the user's default colour, medium priority; when the user
//   switches to timed: the next quarter hour today, 09:00 on other days, one hour long;
// - times in 15-minute slots (a stored time off the grid, e.g. from the legacy import, stays selectable);
// - when the start moves after the end, the end moves to the start (FR-CAL-07, as specified — not keeping the length);
// - checks mirror the server (end ≥ start, title ≤ 150, location ≤ 500); a series lasts one day;
// - changes of an existing event are sent as changed fields with the values they started from (field-level merge),
//   a new calendar as a move.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. `reminders`: the user's reminders as canonical text (lib/reminders
//   specsText), so they are part of the draft and of "unsaved changes" like every other field; not an event field.
import { addDays } from "@/lib/datetime";
import { effectiveStart, exceptionsOf } from "@/lib/dayView";

export const TITLE_MAX = 150;
export const LOCATION_MAX = 500;
export const NO_TITLE = "(No title)";

export const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];
const RRULE: Record<Repeat, string | null> = {
  none: null,
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};

export interface EventForm extends Record<string, string> {
  title: string;
  all_day: "true" | "false";
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  location: string;
  body: string;
  color: string;
  priority: string;
  calendar_id: string;
  repeat: Repeat;
  reminders: string;
}

export type FormErrors = Partial<Record<"title" | "end" | "location", "tooLong" | "endBeforeStart">>;

type Row = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** "00:00" … "23:45". */
export const QUARTERS: readonly string[] = Array.from(
  { length: 96 },
  (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
);

/** The slots offered for a field: the quarter hours, plus the stored time when it is off the grid. */
export function slotsFor(value: string): string[] {
  return value && !QUARTERS.includes(value) ? [...QUARTERS, value].sort() : [...QUARTERS];
}

function minutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hhmm(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Start and end of a new timed event on `date`: the next quarter hour today, 09:00 otherwise; one hour long. */
export function defaultTimes(
  date: string,
  today: string,
  now: string,
): Pick<EventForm, "start_time" | "end_time" | "end_date"> {
  const start = date === today ? Math.ceil((minutes(now) + 1) / 15) * 15 : 9 * 60;
  if (start >= 24 * 60) return { start_time: "23:45", end_time: "23:45", end_date: date };
  const end = start + 60;
  return end >= 24 * 60
    ? { start_time: hhmm(start), end_time: hhmm(end - 24 * 60), end_date: addDays(date, 1) }
    : { start_time: hhmm(start), end_time: hhmm(end), end_date: date };
}

export function newEventForm(date: string, color: string, calendarId: string): EventForm {
  return {
    title: "",
    all_day: "true",
    start_date: date,
    start_time: "",
    end_date: date,
    end_time: "",
    location: "",
    body: "",
    color,
    priority: "medium",
    calendar_id: calendarId,
    repeat: "none",
    reminders: "[]",
  };
}

export function repeatOf(rrule: unknown): Repeat {
  const found = (Object.keys(RRULE) as Repeat[]).find((key) => RRULE[key] === rrule);
  return found ?? "none";
}

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. A series opens at its effective start (its first dates may be
// excluded, F-23); saving an edit then stores that start. `occurrence`: the form of a one-off copy of that date.
export function formFromRow(row: Row, occurrence?: string): EventForm {
  const start = occurrence ?? effectiveStart(text(row.start_date), text(row.rrule) || null, exceptionsOf(row));
  return {
    title: text(row.title) === NO_TITLE ? "" : text(row.title),
    all_day: row.all_day === false ? "false" : "true",
    start_date: start,
    start_time: text(row.start_time),
    end_date: occurrence ?? (row.rrule ? start : text(row.end_date) || start),
    end_time: text(row.end_time),
    location: text(row.location),
    body: text(row.body),
    color: text(row.color) || "brown",
    priority: text(row.priority) || "medium",
    calendar_id: text(row.container_id),
    repeat: occurrence ? "none" : repeatOf(row.rrule),
    reminders: "[]",
  };
}

/** Start and end as comparable text ("YYYY-MM-DD HH:MM"; all-day = whole days). */
function span(form: EventForm): [string, string] {
  if (form.all_day === "true") return [form.start_date, form.repeat === "none" ? form.end_date : form.start_date];
  const endDate = form.repeat === "none" ? form.end_date : form.start_date;
  return [`${form.start_date} ${form.start_time}`, `${endDate} ${form.end_time}`];
}

/** FR-CAL-07: a start moved after the end takes the end along (end := start). */
export function withStart(form: EventForm, patch: Partial<Pick<EventForm, "start_date" | "start_time">>): EventForm {
  const next = { ...form, ...patch };
  const [start, end] = span(next);
  if (end >= start) return next;
  return { ...next, end_date: next.start_date, ...(next.all_day === "false" ? { end_time: next.start_time } : {}) };
}

/** Turning "all day" off fills in times; turning it on clears them (FR-CAL-06). */
export function withAllDay(form: EventForm, allDay: boolean, today: string, now: string): EventForm {
  if (allDay) return { ...form, all_day: "true", start_time: "", end_time: "" };
  const times = defaultTimes(form.start_date, today, now);
  return { ...form, all_day: "false", ...times, end_date: form.repeat === "none" ? times.end_date : form.start_date };
}

export function validate(form: EventForm): FormErrors {
  const errors: FormErrors = {};
  if (form.title.length > TITLE_MAX) errors.title = "tooLong";
  if (form.location.length > LOCATION_MAX) errors.location = "tooLong";
  const [start, end] = span(form);
  if (end < start) errors.end = "endBeforeStart";
  return errors;
}

/** The event fields as the server takes them. */
export function eventData(form: EventForm): Record<string, unknown> {
  const timed = form.all_day === "false";
  return {
    title: form.title.trim(),
    body: form.body || null,
    color: form.color,
    priority: form.priority,
    location: form.location.trim() || null,
    all_day: !timed,
    start_date: form.start_date,
    start_time: timed ? form.start_time : null,
    end_date: form.repeat === "none" ? form.end_date : form.start_date,
    end_time: timed ? form.end_time : null,
    rrule: RRULE[form.repeat],
  };
}

/** What an edit changes: event fields with their starting values, and a new calendar if one was chosen. */
export function changesOf(
  row: Row,
  form: EventForm,
): { data: Record<string, unknown>; base: Record<string, unknown>; moveTo: string | null } {
  const next = eventData(form);
  const data: Record<string, unknown> = {};
  const base: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(next)) {
    const before = row[name] ?? null;
    const same = name === "title" ? (text(before) === NO_TITLE ? "" : text(before)) === value : before === value;
    if (!same) {
      data[name] = value;
      base[name] = before;
    }
  }
  const moveTo = form.calendar_id && form.calendar_id !== text(row.container_id) ? form.calendar_id : null;
  return { data, base, moveTo };
}
