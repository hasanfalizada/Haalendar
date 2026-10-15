// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Display of instants in the user's time zone (FR-ACC-11): the zone
// from the profile, not the device's. UTC instants from the API are formatted with Intl in that zone.
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
