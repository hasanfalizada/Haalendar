// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Repeat rules in the editor and on the card (FR-CAL-30, D-80),
// without React:
// - the editor keeps a rule relative to the start date (RepeatSpec): "monthly on the Nth weekday" means the weekday
//   and week of whatever date the event starts on, so presets follow a changed date; rruleOf writes it as RRULE
//   (calendar.recurrence.v2) in one canonical form, specFromRrule reads a stored rule back;
// - presets for a start date (every day, week on its weekday, month on its day / Nth or last weekday / last day, year)
//   and Custom (every N days/weeks/months/years, weekdays, monthly mode, end never / on a date / after N times);
// - what is wrong with a rule for its start (ruleProblem), the readable text ("Every 2 weeks on Mon and Wed, until
//   Dec 31, 2026"), and how a whole series moves by whole days (shiftedRule: only rules that take their days from the
//   start can move to another day — explicit weekdays, Nth weekday and last day would change their meaning).
// The form holds strings (it is also its own draft): the spec travels as JSON text, "none" = no repeat; the values
// of the earlier editor ("daily", "weekly", "monthly", "yearly") are still read.
import { MAX_COUNT, MAX_INTERVAL, type Rule, WEEKDAYS, occurrences, parseRule } from "@/atoms/calendar/recurrence";
import i18n from "@/i18n";
import { addDays } from "@/lib/datetime";

export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly";
/** day: the start's day of month; weekday: its Nth weekday (1st..4th); lastWeekday / lastDay of the month. */
export type MonthlyMode = "day" | "weekday" | "lastWeekday" | "lastDay";
export type RepeatEnd = "never" | "until" | "count";

export interface RepeatSpec {
  freq: RepeatFreq;
  interval: number;
  /** Weekly: the chosen days, Monday = 0, ascending; empty = the start's weekday. */
  weekdays: number[];
  monthly: MonthlyMode;
  end: RepeatEnd;
  /** "YYYY-MM-DD" when end = until. */
  until: string;
  count: number;
}

export type RuleProblem = "interval" | "count" | "until" | "startNotInRule";

export const NO_REPEAT = "none";
export { MAX_COUNT, MAX_INTERVAL };
const FREQS: readonly RepeatFreq[] = ["daily", "weekly", "monthly", "yearly"];
const NTH = ["first", "second", "third", "fourth"] as const;

export function plainSpec(freq: RepeatFreq, monthly: MonthlyMode = "day"): RepeatSpec {
  return { freq, interval: 1, weekdays: [], monthly, end: "never", until: "", count: 10 };
}

const day = (date: string) => Number(date.slice(8, 10));
const daysInMonth = (date: string) =>
  new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
/** Monday = 0. */
export const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
/** Which of its weekdays in the month the date is: 1..5. */
const weekOfMonth = (date: string) => Math.ceil(day(date) / 7);

/** The monthly modes a start date allows. */
export function monthlyModes(start: string): MonthlyMode[] {
  const modes: MonthlyMode[] = ["day"];
  if (weekOfMonth(start) <= 4) modes.push("weekday");
  if (day(start) + 7 > daysInMonth(start)) modes.push("lastWeekday");
  if (day(start) === daysInMonth(start)) modes.push("lastDay");
  return modes;
}

/** The weekly days the rule uses for `start`. */
export function weekdaysOf(spec: RepeatSpec, start: string): number[] {
  return spec.weekdays.length > 0 ? spec.weekdays : [weekdayIndex(start)];
}

/** The spec as RRULE for `start` (canonical: FREQ;INTERVAL;BYDAY;BYMONTHDAY;UNTIL;COUNT, defaults left out). */
export function rruleOf(spec: RepeatSpec | null, start: string): string | null {
  if (!spec) return null;
  const parts = [`FREQ=${spec.freq.toUpperCase()}`];
  if (spec.interval !== 1) parts.push(`INTERVAL=${String(spec.interval)}`);
  if (spec.freq === "weekly") {
    const days = weekdaysOf(spec, start);
    if (!(days.length === 1 && days[0] === weekdayIndex(start))) {
      parts.push(`BYDAY=${days.map((d) => WEEKDAYS[d] ?? "MO").join(",")}`);
    }
  }
  if (spec.freq === "monthly") {
    const weekday = WEEKDAYS[weekdayIndex(start)] ?? "MO";
    if (spec.monthly === "weekday") parts.push(`BYDAY=${String(weekOfMonth(start))}${weekday}`);
    if (spec.monthly === "lastWeekday") parts.push(`BYDAY=-1${weekday}`);
    if (spec.monthly === "lastDay") parts.push("BYMONTHDAY=-1");
  }
  if (spec.end === "until") parts.push(`UNTIL=${spec.until.replaceAll("-", "")}`);
  if (spec.end === "count") parts.push(`COUNT=${String(spec.count)}`);
  return parts.join(";");
}

function specOfRule(rule: Rule, start: string): RepeatSpec {
  const freq = rule.freq.toLowerCase() as RepeatFreq;
  let monthly: MonthlyMode = "day";
  if (rule.nth) monthly = rule.nth[0] === -1 ? "lastWeekday" : "weekday";
  else if (rule.monthDay === -1) monthly = "lastDay";
  const own = rule.weekdays.length === 1 && rule.weekdays[0] === weekdayIndex(start);
  return {
    ...plainSpec(freq, monthly),
    interval: rule.interval,
    weekdays: own ? [] : rule.weekdays,
    end: rule.until ? "until" : rule.count ? "count" : "never",
    until: rule.until ?? "",
    count: rule.count ?? 10,
  };
}

/** A stored rule as the editor's spec; null for none (or a rule this version cannot read). */
export function specFromRrule(rrule: unknown, start: string): RepeatSpec | null {
  if (typeof rrule !== "string" || rrule === "") return null;
  try {
    return specOfRule(parseRule(rrule), start);
  } catch {
    return null;
  }
}

/** The form field's text. */
export function specText(spec: RepeatSpec | null): string {
  return spec ? JSON.stringify(spec) : NO_REPEAT;
}

/** The form field read back; also the earlier editor's plain values. */
export function specFromText(text: string | undefined): RepeatSpec | null {
  if (!text || text === NO_REPEAT) return null;
  if ((FREQS as readonly string[]).includes(text)) return plainSpec(text as RepeatFreq);
  try {
    const value = JSON.parse(text) as Partial<RepeatSpec>;
    if (!value.freq || !FREQS.includes(value.freq)) return null;
    return { ...plainSpec(value.freq), ...value };
  } catch {
    return null;
  }
}

/** What keeps the rule from being saved with this start, if anything. */
export function ruleProblem(spec: RepeatSpec | null, start: string): RuleProblem | null {
  if (!spec) return null;
  if (!Number.isInteger(spec.interval) || spec.interval < 1 || spec.interval > MAX_INTERVAL) return "interval";
  if (spec.end === "count" && (!Number.isInteger(spec.count) || spec.count < 1 || spec.count > MAX_COUNT)) {
    return "count";
  }
  if (spec.end === "until" && (!/^\d{4}-\d{2}-\d{2}$/.test(spec.until) || spec.until < start)) return "until";
  if (spec.freq === "weekly" && !weekdaysOf(spec, start).includes(weekdayIndex(start))) return "startNotInRule";
  if (spec.freq === "monthly" && !monthlyModes(start).includes(spec.monthly)) return "startNotInRule";
  return null;
}

// --- Presets -------------------------------------------------------------------------------------------------------

export type PresetKey = "none" | "daily" | "weekly" | `monthly:${MonthlyMode}` | "yearly";

/** The presets offered for a start date, in the order shown. */
export function presetsFor(start: string): PresetKey[] {
  return ["none", "daily", "weekly", ...monthlyModes(start).map((mode) => `monthly:${mode}` as const), "yearly"];
}

export function presetSpec(key: PresetKey): RepeatSpec | null {
  if (key === "none") return null;
  if (key.startsWith("monthly:")) return plainSpec("monthly", key.slice(8) as MonthlyMode);
  return plainSpec(key as RepeatFreq);
}

/** The preset the spec is, or "custom". */
export function presetOf(spec: RepeatSpec | null, start: string): PresetKey | "custom" {
  if (!spec) return "none";
  const plain =
    spec.interval === 1 &&
    spec.end === "never" &&
    (spec.freq !== "weekly" || weekdaysOf(spec, start).join() === String(weekdayIndex(start)));
  if (!plain) return "custom";
  return spec.freq === "monthly" ? `monthly:${spec.monthly}` : spec.freq;
}

// --- Text ----------------------------------------------------------------------------------------------------------

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Weekday names, Monday = 0 ("Monday" or "Mon"). */
export function weekdayLabel(index: number, locale: string, width: "long" | "short" | "narrow" = "long"): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(Date.UTC(2024, 0, 1 + index));
}

/** "Every 2 weeks on Mon and Wed, until Dec 31, 2026", "Every month on the last Friday", "Every year on October 28". */
export function describeSpec(spec: RepeatSpec, start: string, locale: string = i18n.language): string {
  const t = i18n.t.bind(i18n);
  const count = spec.interval;
  let rule: string;
  if (spec.freq === "daily") rule = t("repeat.daily", { count });
  else if (spec.freq === "weekly") {
    const days = weekdaysOf(spec, start);
    const names =
      days.length === 1
        ? weekdayLabel(days[0] ?? 0, locale)
        : new Intl.ListFormat(locale, { type: "conjunction" }).format(
            days.map((d) => weekdayLabel(d, locale, "short")),
          );
    rule = t("repeat.weeklyOn", { count, days: names });
  } else if (spec.freq === "monthly") {
    const weekday = weekdayLabel(weekdayIndex(start), locale);
    if (spec.monthly === "weekday") {
      rule = t("repeat.monthlyWeekday", {
        count,
        nth: t(`repeat.nth.${NTH[weekOfMonth(start) - 1] ?? "fourth"}`),
        weekday,
      });
    } else if (spec.monthly === "lastWeekday") {
      rule = t("repeat.monthlyWeekday", { count, nth: t("repeat.nth.last"), weekday });
    } else if (spec.monthly === "lastDay") rule = t("repeat.monthlyLastDay", { count });
    else rule = t("repeat.monthlyDay", { count, day: day(start) });
  } else {
    const date = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", timeZone: "UTC" }).format(utc(start));
    rule = t("repeat.yearly", { count, date });
  }
  if (spec.end === "until" && spec.until) {
    const until = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(utc(spec.until));
    return t("repeat.until", { rule, date: until });
  }
  if (spec.end === "count") return t("repeat.times", { rule, count: spec.count });
  return rule;
}

/** The stored rule of a series as text; null for a one-off event. */
export function describeRrule(rrule: unknown, start: string, locale?: string): string | null {
  const spec = specFromRrule(rrule, start);
  return spec ? describeSpec(spec, start, locale) : null;
}

// --- Whole series ----------------------------------------------------------------------------------------------------

/**
 * The rule of a series whose start moves by `days`: the same rule (its end date moved along), or null when the rule
 * names its days itself and moving to another day would change its meaning.
 */
export function shiftedRule(rrule: string, days: number): string | null {
  if (days === 0) return rrule;
  let rule: Rule;
  try {
    rule = parseRule(rrule);
  } catch {
    return null;
  }
  if (rule.weekdays.length > 0 || rule.nth || rule.monthDay !== null) return null;
  if (!rule.until) return rrule;
  const until = addDays(rule.until, days).replaceAll("-", "");
  return rrule.replace(/UNTIL=\d{8}/, `UNTIL=${until}`);
}

/** How many dates of the rule lie in [start, before) — excluded ones included (COUNT counts them, RFC 5545). */
export function datesBefore(start: string, rrule: string, before: string): number {
  let total = 0;
  for (let from = start; from < before; from = addDays(from, 367)) {
    const to = addDays(from, 366) < before ? addDays(from, 366) : addDays(before, -1);
    total += occurrences({ start_date: start, rrule, exceptions: [], from, to }).length;
  }
  return total;
}
