// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Display of instants in the user's time zone (FR-ACC-11): the zone
// from the profile, not the device's. UTC instants from the API are formatted with Intl in that zone.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Relative form for recent instants ("3 hours ago"), date and time
// for anything older than 7 days.
import { useQuery } from "@tanstack/react-query";

import { meQuery } from "@/api/session";
import { browserTimeZone } from "@/components/auth/timezone";

export type InstantStyle = "datetime" | "date";

const STYLES: Record<InstantStyle, Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  date: { dateStyle: "medium" },
};

export function formatInstant(iso: string, timeZone: string, locale: string, style: InstantStyle = "datetime"): string {
  return new Intl.DateTimeFormat(locale, { ...STYLES[style], timeZone }).format(new Date(iso));
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
export function formatRelative(iso: string, now: Date, timeZone: string, locale: string): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const elapsed = Math.abs(diff);
  if (elapsed >= RELATIVE_LIMIT_MS) return formatInstant(iso, timeZone, locale);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < MINUTE) return rtf.format(0, "second");
  if (elapsed < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
  if (elapsed < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  return rtf.format(Math.round(diff / DAY), "day");
}
