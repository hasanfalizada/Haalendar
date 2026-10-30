// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Reminders on the client (FR-CAL-29, D-79), without React:
// - a reminder's form: "before" (offset_minutes) or "on the day" (all_day_time "HH:MM", all_day_days_before);
// - the presets of the editor for timed and all-day events, at most MAX_REMINDERS per event;
// - a reminder's label ("15 minutes before", "1 day before at 09:00") and the key that tells two equal ones apart;
// - the user's active reminders of an item from the local rows, in the order they fire;
// - the day and time a reminder notification is about, in the reader's zone (payload of the worker).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. The third form, of notes (D-89): a date and time (`remind_at`, an
// instant kept as UTC "YYYY-MM-DDTHH:MM:00.000Z"), shown and entered in the reader's zone.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Cards (D-94) take the two event forms, counted from the due date
// (with its time, else its 00:00): what a card's reminder notification is about, and whether a reminder of a card is
// still ahead (the due date read in the reader's zone — the board owner's on the server; the same zone on one's own
// boards).
import { localToUtc, wallClock } from "@/atoms/time/localToUtc";
import i18n from "@/i18n";

import { clockText } from "./dayView";

export const MAX_REMINDERS = 5;
export const MAX_OFFSET_MINUTES = 40_320; // 28 days, as on the server
export const MAX_DAYS_BEFORE = 28;

export type ReminderSpec =
  { offset_minutes: number } | { all_day_time: string; all_day_days_before: number } | { remind_at: string };

type Row = Record<string, unknown>;

export const TIMED_PRESETS: readonly ReminderSpec[] = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080].map(
  (offset_minutes) => ({ offset_minutes }),
);
export const ALL_DAY_PRESETS: readonly ReminderSpec[] = [0, 1, 2, 7].map((all_day_days_before) => ({
  all_day_time: "09:00",
  all_day_days_before,
}));

export function isBefore(spec: ReminderSpec): spec is { offset_minutes: number } {
  return "offset_minutes" in spec;
}

export function isAt(spec: ReminderSpec): spec is { remind_at: string } {
  return "remind_at" in spec;
}

/** An instant in the one form reminders keep it (UTC, whole minutes); null when it is no date. */
export function atInstant(value: string | number): string | null {
  const ms = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

/** Equal reminders have equal keys. */
export function specKey(spec: ReminderSpec): string {
  if (isAt(spec)) return `at:${spec.remind_at}`;
  return isBefore(spec)
    ? `before:${String(spec.offset_minutes)}`
    : `day:${String(spec.all_day_days_before)}@${spec.all_day_time}`;
}

/** Roughly minutes before the start (for ordering: earlier first). */
function lead(spec: ReminderSpec): number {
  if (isAt(spec)) return -Date.parse(spec.remind_at) / 60_000;
  if (isBefore(spec)) return spec.offset_minutes;
  const [h = 0, m = 0] = spec.all_day_time.split(":").map(Number);
  return spec.all_day_days_before * 1440 - (h * 60 + m);
}

export function sortSpecs(specs: readonly ReminderSpec[]): ReminderSpec[] {
  return [...specs].sort((a, b) => lead(b) - lead(a));
}

/** The form of a stored reminder row, or null for a row that has none. */
export function specOf(row: Row): ReminderSpec | null {
  if (typeof row.remind_at === "string") {
    const at = atInstant(row.remind_at);
    return at ? { remind_at: at } : null;
  }
  if (typeof row.offset_minutes === "number") return { offset_minutes: row.offset_minutes };
  if (typeof row.all_day_time === "string" && typeof row.all_day_days_before === "number") {
    return { all_day_time: row.all_day_time.slice(0, 5), all_day_days_before: row.all_day_days_before };
  }
  return null;
}

/** The user's active reminders of an item with their ids, in firing order. */
export function remindersOf(rows: readonly Row[], itemId: string): { id: string; spec: ReminderSpec }[] {
  const found = rows.flatMap((row) => {
    const spec = row.item_id === itemId && !row.deleted_at ? specOf(row) : null;
    return spec ? [{ id: String(row.id), spec }] : [];
  });
  return found.sort((a, b) => lead(b.spec) - lead(a.spec));
}

/** "At the start", "15 minutes before", "2 hours before", "1 day before", "On the day at 09:00", "1 day before at 09:00". */
export function reminderLabel(spec: ReminderSpec, timeFormat: "12h" | "24h", timeZone?: string): string {
  const t = i18n.t.bind(i18n);
  if (isAt(spec)) return atLabel(spec.remind_at, timeZone ?? "UTC", timeFormat, Date.now());
  if (isBefore(spec)) {
    const minutes = spec.offset_minutes;
    if (minutes === 0) return t("reminders.atStart");
    if (minutes % 10080 === 0) return t("reminders.weeksBefore", { count: minutes / 10080 });
    if (minutes % 1440 === 0) return t("reminders.daysBefore", { count: minutes / 1440 });
    if (minutes % 60 === 0) return t("reminders.hoursBefore", { count: minutes / 60 });
    return t("reminders.minutesBefore", { count: minutes });
  }
  const time = clockText(spec.all_day_time, i18n.language, timeFormat);
  if (spec.all_day_days_before === 0) return t("reminders.onTheDay", { time });
  return t("reminders.daysBeforeAt", { count: spec.all_day_days_before, time });
}

/** The editor's form field: the reminders as canonical text (the form and its draft hold strings). */
export function specsText(specs: readonly ReminderSpec[]): string {
  return JSON.stringify(sortSpecs(specs));
}

export function specsFromText(text: string | undefined): ReminderSpec[] {
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value: unknown) => {
      const spec = value && typeof value === "object" ? specOf(value as Row) : null;
      return spec ? [spec] : [];
    });
  } catch {
    return [];
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * What a reminder notification is about, in the reader's zone: the day ("YYYY-MM-DD") and, for a timed event, the start
 * and end clock times ("HH:MM").
 */
export function reminderWhen(
  payload: Row,
  viewerTz: string,
): { day: string; start: string | null; end: string | null } | null {
  const occurrence = typeof payload.occurrence_date === "string" ? payload.occurrence_date : null;
  if (!occurrence) return null;
  const startTime = typeof payload.start_time === "string" ? payload.start_time : null;
  const tzid = typeof payload.tzid === "string" ? payload.tzid : viewerTz;
  if (payload.all_day !== false || startTime === null) return { day: occurrence, start: null, end: null };
  const startMs = Date.parse(localToUtc(occurrence, startTime, tzid).utc);
  const length = typeof payload.length_minutes === "number" ? payload.length_minutes : 0;
  const local = (ms: number) => {
    const w = wallClock(ms, viewerTz);
    return {
      day: `${String(w.year).padStart(4, "0")}-${pad(w.month)}-${pad(w.day)}`,
      time: `${pad(w.hour)}:${pad(w.minute)}`,
    };
  };
  const from = local(startMs);
  const to = local(startMs + length * 60_000);
  return { day: from.day, start: from.time, end: length > 0 ? to.time : null };
}

/** An instant's day ("YYYY-MM-DD") and clock time ("HH:MM") in a zone. */
export function localParts(instant: string | number, timeZone: string): { day: string; time: string } {
  const w = wallClock(typeof instant === "number" ? instant : Date.parse(instant), timeZone);
  return {
    day: `${String(w.year).padStart(4, "0")}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** "Today, 09:00", "Tomorrow, 9:00 AM" or "Tue, Nov 10, 09:00" — a date-and-time reminder in the reader's zone. */
export function atLabel(instant: string, timeZone: string, timeFormat: "12h" | "24h", now: number): string {
  const { day, time } = localParts(instant, timeZone);
  const today = localParts(now, timeZone).day;
  const tomorrow = localParts(Date.parse(`${today}T12:00:00Z`) + 86_400_000, "UTC").day;
  const clock = clockText(time, i18n.language, timeFormat);
  const date =
    day === today
      ? i18n.t("calendar.header.today")
      : day === tomorrow
        ? i18n.t("calendar.agenda.tomorrow")
        : new Intl.DateTimeFormat(i18n.language, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
            timeZone: "UTC",
          }).format(new Date(`${day}T12:00:00Z`));
  return `${date}, ${clock}`;
}

/** The instant of a day and clock time in a zone (what the note editor's fields mean). */
export function atFromLocal(day: string, time: string, timeZone: string): string | null {
  try {
    return atInstant(localToUtc(day, time, timeZone).utc);
  } catch {
    return null;
  }
}

/** The next date-and-time reminder of an item still ahead of `now`, or null. */
export function nextReminder(rows: readonly Row[], itemId: string, now: number): string | null {
  const ahead = remindersOf(rows, itemId).flatMap(({ spec }) =>
    isAt(spec) && Date.parse(spec.remind_at) > now ? [spec.remind_at] : [],
  );
  return ahead.sort()[0] ?? null;
}

/** What a card's reminder notification is about, in the reader's zone: its due day and time. */
export function cardReminderWhen(
  payload: Row,
  viewerTz: string,
): { day: string; start: string | null; end: string | null } | null {
  const due = typeof payload.due_date === "string" ? payload.due_date : null;
  if (!due) return null;
  const time = typeof payload.due_time === "string" ? payload.due_time : null;
  return reminderWhen(
    { occurrence_date: due, start_time: time, all_day: time === null, tzid: payload.tzid, length_minutes: 0 },
    viewerTz,
  );
}

/** When a card's reminder fires (ms), the due date and time read in `timeZone`; null without a due date. */
export function cardFireTime(
  spec: ReminderSpec,
  dueDate: string | null,
  dueTime: string | null,
  timeZone: string,
): number | null {
  if (!dueDate || isAt(spec)) return null;
  if (isBefore(spec)) {
    return Date.parse(localToUtc(dueDate, dueTime ?? "00:00", timeZone).utc) - spec.offset_minutes * 60_000;
  }
  const day = new Date(Date.parse(`${dueDate}T12:00:00Z`) - spec.all_day_days_before * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return Date.parse(localToUtc(day, spec.all_day_time, timeZone).utc);
}

/** Whether the user has a reminder of the card still ahead of `now`. */
export function cardReminderAhead(rows: readonly Row[], card: Row, timeZone: string, now: number): boolean {
  const dueDate = typeof card.due_date === "string" ? card.due_date : null;
  const dueTime = typeof card.due_time === "string" ? card.due_time : null;
  return remindersOf(rows, String(card.id)).some(({ spec }) => {
    const at = cardFireTime(spec, dueDate, dueTime, timeZone);
    return at !== null && at >= now;
  });
}
