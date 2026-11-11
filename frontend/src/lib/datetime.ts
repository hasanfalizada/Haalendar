// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Display of instants in the user's time zone (FR-ACC-11): the zone
// from the profile, not the device's. UTC instants from the API are formatted with Intl in that zone.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Relative form for recent instants ("3 hours ago"), date and time
// for anything older than 7 days.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Times follow the user's 12/24-hour setting; useInstantFormat binds
// zone, language and that setting for components.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { Settings } from "@/api/generated/types.gen";
import { useSettings } from "@/api/settings";
import { meQuery } from "@/api/session";
import { browserTimeZone } from "@/components/auth/timezone";

export type InstantStyle = "datetime" | "date";
export type TimeFormat = Settings["time_format"];

const STYLES: Record<InstantStyle, Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
};

export function formatInstant(
  iso: string,
  timeZone: string,
  locale: string,
  style: InstantStyle = "datetime",
  timeFormat: TimeFormat = "24h",
): string {
  return new Intl.DateTimeFormat(locale, {
    ...STYLES[style],
    timeZone,
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
  }).format(new Date(iso));
}

/** Canonical form of a zone name as the browser knows it (aliases such as Europe/Kiev → Europe/Kyiv). */
export function canonicalZone(tzid: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tzid }).resolvedOptions().timeZone;
  } catch {
    return tzid;
  }
}

/** The zone used for display: the profile's, or the device's until the profile is known. */
export function useDisplayTimeZone(): string {
  const { data: me } = useQuery(meQuery);
  return me?.time_zone ?? browserTimeZone();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const RELATIVE_LIMIT_MS = 7 * DAY;

/** "now", "5 minutes ago", "yesterday", "3 days ago" — or the absolute date and time after 7 days. */
export function formatRelative(
  iso: string,
  now: Date,
  timeZone: string,
  locale: string,
  timeFormat: TimeFormat = "24h",
): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const elapsed = Math.abs(diff);
  if (elapsed >= RELATIVE_LIMIT_MS) return formatInstant(iso, timeZone, locale, "datetime", timeFormat);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < MINUTE) return rtf.format(0, "second");
  if (elapsed < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
  if (elapsed < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  return rtf.format(Math.round(diff / DAY), "day");
}

/** Formatters bound to the user's time zone, language and 12/24-hour setting. */
export function useInstantFormat(): {
  timeZone: string;
  instant: (iso: string, style?: InstantStyle) => string;
  relative: (iso: string, now: Date) => string;
} {
  const timeZone = useDisplayTimeZone();
  const { i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const locale = i18n.language;
  return useMemo(
    () => ({
      timeZone,
      instant: (iso: string, style: InstantStyle = "datetime") =>
        formatInstant(iso, timeZone, locale, style, timeFormat),
      relative: (iso: string, now: Date) => formatRelative(iso, now, timeZone, locale, timeFormat),
    }),
    [timeZone, locale, timeFormat],
  );
}

/** Today's calendar date ("YYYY-MM-DD") in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year ?? ""}-${parts.month ?? ""}-${parts.day ?? ""}`;
}

/** `iso` ("YYYY-MM-DD") moved by `days` calendar days. */
export function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. Shared by drag and drop and the duplicate (was in eventDrag).
/** Calendar days from `from` to `to` ("YYYY-MM-DD"; negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
