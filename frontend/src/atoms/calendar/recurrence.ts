// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. Atom calendar.recurrence — TypeScript implementation. Dates are
// "YYYY-MM-DD", computed on UTC midnights so no time zone can shift them; the first candidate is computed directly, so
// a series started years ago costs no more than one inside the window.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Version 2 (contract: atoms/calendar.recurrence.v2/contract.json,
// FR-CAL-30, D-80), the same algorithm as the Python implementation: a subset of RFC 5545 RRULE — FREQ, INTERVAL,
// BYDAY (weekly: days; monthly: one Nth weekday, 1st..4th or last), BYMONTHDAY (monthly: one day or -1 = the last),
// UNTIL (a date) or COUNT; occurrences per period (every INTERVAL days, weeks from Monday, months or years from the
// start's); COUNT counts the dates before the window, excluded ones included. The start must be an occurrence.
export interface RecurrenceInput {
  start_date: string;
  /** null = one-off event. */
  rrule: string | null;
  exceptions: readonly string[];
  from: string;
  to: string;
}

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Rule {
  freq: Freq;
  interval: number;
  /** Weekly: chosen days, Monday = 0; empty = the start's weekday. */
  weekdays: number[];
  /** Monthly: [1..4 or -1, weekday]. */
  nth: [number, number] | null;
  /** Monthly: 1..31 or -1 (the last day). */
  monthDay: number | null;
  /** "YYYY-MM-DD". */
  until: string | null;
  count: number | null;
}

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const MAX_INTERVAL = 99;
export const MAX_COUNT = 999;
const FREQS: readonly string[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const MAX_WINDOW_DAYS = 366;
const DAY_MS = 86_400_000;
const LAST_DAY = Date.UTC(9999, 11, 31) / DAY_MS;
const NUMBER = /^[1-9][0-9]*$/;
const NTH = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/;
const UNTIL = /^([0-9]{4})([0-9]{2})([0-9]{2})$/;

export type RecurrenceErrorCode = "UNSUPPORTED_RRULE" | "START_NOT_IN_RULE" | "INVALID_WINDOW" | "WINDOW_TOO_LARGE";

export class RecurrenceError extends Error {
  constructor(readonly code: RecurrenceErrorCode) {
    super(code);
  }
}

const unsupported = () => new RecurrenceError("UNSUPPORTED_RRULE");

function number(value: string, highest: number): number {
  if (!NUMBER.test(value) || Number(value) > highest) throw unsupported();
  return Number(value);
}

function dayNumber(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`not a date: ${iso}`);
  return ms / DAY_MS;
}

function iso(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const utcDay = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / DAY_MS;

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-based here
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Monday = 0. */
const weekdayOf = (day: number) => (((day + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday

/** The rule's parts; throws UNSUPPORTED_RRULE for anything outside the supported subset. */
export function parseRule(rrule: string): Rule {
  const parts = new Map<string, string>();
  for (const part of rrule.split(";")) {
    const at = part.indexOf("=");
    const [name, value] = at < 0 ? ["", ""] : [part.slice(0, at), part.slice(at + 1)];
    if (at < 0 || value === "" || parts.has(name)) throw unsupported();
    parts.set(name, value);
  }
  const take = (name: string) => {
    const value = parts.get(name);
    parts.delete(name);
    return value;
  };
  const freq = take("FREQ") ?? "";
  if (!FREQS.includes(freq)) throw unsupported();
  const intervalText = take("INTERVAL");
  const countText = take("COUNT");
  const untilText = take("UNTIL");
  const byday = take("BYDAY");
  const bymonthday = take("BYMONTHDAY");
  if (parts.size > 0) throw unsupported();
  const interval = intervalText === undefined ? 1 : number(intervalText, MAX_INTERVAL);
  const count = countText === undefined ? null : number(countText, MAX_COUNT);
  let until: string | null = null;
  if (untilText !== undefined) {
    const found = UNTIL.exec(untilText);
    if (!found || count !== null) throw unsupported();
    const [y, m, d] = [Number(found[1]), Number(found[2]), Number(found[3])];
    if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m) || y < 1) throw unsupported();
    until = `${untilText.slice(0, 4)}-${untilText.slice(4, 6)}-${untilText.slice(6, 8)}`;
  }
  let weekdays: number[] = [];
  let nth: [number, number] | null = null;
  let monthDay: number | null = null;
  if (byday !== undefined && freq === "WEEKLY") {
    const days = byday.split(",");
    if (days.some((day) => !(WEEKDAYS as readonly string[]).includes(day)) || new Set(days).size !== days.length) {
      throw unsupported();
    }
    weekdays = days.map((day) => (WEEKDAYS as readonly string[]).indexOf(day)).sort((a, b) => a - b);
  } else if (byday !== undefined && freq === "MONTHLY" && bymonthday === undefined) {
    const found = NTH.exec(byday);
    if (!found) throw unsupported();
    nth = [Number(found[1]), (WEEKDAYS as readonly string[]).indexOf(found[2] ?? "")];
  } else if (byday !== undefined) {
    throw unsupported();
  }
  if (bymonthday !== undefined) {
    if (freq !== "MONTHLY") throw unsupported();
    monthDay = bymonthday === "-1" ? -1 : number(bymonthday, 31);
  }
  return { freq: freq as Freq, interval, weekdays, nth, monthDay, until, count };
}

export function isSupportedRrule(rrule: string | null): boolean {
  if (rrule === null) return true;
  try {
    parseRule(rrule);
    return true;
  } catch {
    return false;
  }
}

function inMonth(rule: Rule, startDayOfMonth: number, year: number, month: number): number | null {
  const last = daysIn(year, month);
  if (rule.nth) {
    const [ordinal, weekday] = rule.nth;
    if (ordinal > 0) {
      const first = ((weekday - weekdayOf(utcDay(year, month, 1)) + 7) % 7) + 1;
      return utcDay(year, month, first + 7 * (ordinal - 1));
    }
    return utcDay(year, month, last - ((weekdayOf(utcDay(year, month, last)) - weekday + 7) % 7));
  }
  const day = rule.monthDay ?? startDayOfMonth;
  if (day === -1) return utcDay(year, month, last);
  return day <= last ? utcDay(year, month, day) : null;
}

/** The periods of one rule from one start date (day numbers). */
class Series {
  private readonly days: number[];
  private readonly monday: number;
  private readonly startYear: number;
  private readonly startMonth: number;
  private readonly startDay: number;

  constructor(
    private readonly rule: Rule,
    private readonly start: number,
  ) {
    this.days = rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(start)];
    this.monday = start - weekdayOf(start);
    const date = new Date(start * DAY_MS);
    [this.startYear, this.startMonth, this.startDay] = [
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    ];
  }

  /** First day of period k (null beyond year 9999). */
  periodStart(k: number): number | null {
    const step = k * this.rule.interval;
    let first: number;
    if (this.rule.freq === "DAILY") first = this.start + step;
    else if (this.rule.freq === "WEEKLY") first = this.monday + 7 * step;
    else if (this.rule.freq === "MONTHLY") {
      const total = this.startYear * 12 + this.startMonth - 1 + step;
      first = utcDay(Math.floor(total / 12), (total % 12) + 1, 1);
    } else first = utcDay(this.startYear + step, 1, 1);
    return first <= LAST_DAY ? first : null;
  }

  /** Occurrence candidates of period k, ascending, none before the start. */
  dates(k: number): number[] {
    const first = this.periodStart(k);
    if (first === null) return [];
    let found: number[];
    if (this.rule.freq === "DAILY") found = [first];
    else if (this.rule.freq === "WEEKLY") found = this.days.map((day) => first + day).filter((day) => day <= LAST_DAY);
    else {
      const date = new Date(first * DAY_MS);
      const [year, month] = [date.getUTCFullYear(), date.getUTCMonth() + 1];
      if (this.rule.freq === "MONTHLY") {
        const one = inMonth(this.rule, this.startDay, year, month);
        found = one === null ? [] : [one];
      } else if (this.startMonth === 2 && this.startDay === 29 && !isLeap(year)) found = [];
      else found = [utcDay(year, this.startMonth, this.startDay)];
    }
    return found.filter((day) => day >= this.start);
  }

  /** The period that holds `day` (or the last one starting before it). */
  firstPeriod(day: number): number {
    if (day <= this.start) return 0;
    const { freq, interval } = this.rule;
    if (freq === "DAILY") return Math.ceil((day - this.start) / interval);
    if (freq === "WEEKLY") return Math.floor(Math.floor((day - this.monday) / 7) / interval);
    const date = new Date(day * DAY_MS);
    if (freq === "MONTHLY") {
      return Math.floor(
        ((date.getUTCFullYear() - this.startYear) * 12 + date.getUTCMonth() + 1 - this.startMonth) / interval,
      );
    }
    return Math.floor((date.getUTCFullYear() - this.startYear) / interval);
  }

  /** How many occurrences the periods before k hold (stops early once past COUNT). */
  countBefore(k: number): number {
    if (k === 0) return 0;
    const { freq, nth, monthDay, count } = this.rule;
    if (freq === "DAILY") return k;
    if (freq === "WEEKLY") return this.dates(0).length + (k - 1) * this.days.length;
    if (freq === "MONTHLY" && (nth !== null || monthDay === -1 || this.startDay <= 28)) return k;
    let seen = 0;
    for (let period = 0; period < k; period += 1) {
      seen += this.dates(period).length;
      if (seen >= (count ?? 0)) break;
    }
    return seen;
  }
}

function fits(rule: Rule, start: number): boolean {
  if (rule.until !== null && dayNumber(rule.until) < start) return false;
  if (rule.weekdays.length > 0 && !rule.weekdays.includes(weekdayOf(start))) return false;
  if (rule.freq === "MONTHLY" && (rule.nth !== null || rule.monthDay !== null)) {
    const date = new Date(start * DAY_MS);
    return inMonth(rule, date.getUTCDate(), date.getUTCFullYear(), date.getUTCMonth() + 1) === start;
  }
  return true;
}

/** Throws UNSUPPORTED_RRULE or START_NOT_IN_RULE; a one-off event (null) always passes. */
export function checkRule(startDate: string, rrule: string | null): void {
  if (rrule !== null && !fits(parseRule(rrule), dayNumber(startDate))) {
    throw new RecurrenceError("START_NOT_IN_RULE");
  }
}

function* candidates(rule: Rule, start: number, first: number, last: number): Generator<number> {
  const series = new Series(rule, start);
  let k = series.firstPeriod(first);
  let seen = rule.count !== null ? series.countBefore(k) : 0;
  const end = rule.until !== null ? Math.min(last, dayNumber(rule.until)) : last;
  for (;;) {
    const period = series.periodStart(k);
    if (period === null || period > end || (rule.count !== null && seen >= rule.count)) return;
    for (const day of series.dates(k)) {
      if (rule.count !== null) {
        if (seen >= rule.count) return;
        seen += 1;
      }
      if (day > end) return;
      yield day;
    }
    k += 1;
  }
}

/** Occurrence dates inside [from, to], ascending, without exceptions. */
export function occurrences(input: RecurrenceInput): string[] {
  const rule = input.rrule === null ? null : parseRule(input.rrule);
  const [start, from, to] = [dayNumber(input.start_date), dayNumber(input.from), dayNumber(input.to)];
  if (rule !== null && !fits(rule, start)) throw new RecurrenceError("START_NOT_IN_RULE");
  if (to < from) throw new RecurrenceError("INVALID_WINDOW");
  if (to - from > MAX_WINDOW_DAYS) throw new RecurrenceError("WINDOW_TOO_LARGE");
  const first = Math.max(start, from);
  if (first > to) return [];
  const skipped = new Set(input.exceptions);
  const dates: string[] = [];
  for (const day of rule === null ? [start] : candidates(rule, start, first, to)) {
    const date = iso(day);
    if (day >= first && day <= to && !skipped.has(date)) dates.push(date);
  }
  return dates;
}
