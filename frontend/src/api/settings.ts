// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. User settings (FR-ACC-09, D-50) on the generated client. Read once
// per session and kept in the query cache (cleared on sign-out); until they are known — and on the sign-in pages —
// the defaults apply (week starts Monday, 24-hour time, brown, 30-day agenda, Week A/B off).
import { queryOptions, useQuery } from "@tanstack/react-query";

import { getSettings } from "./generated/sdk.gen";
import type { Settings } from "./generated/types.gen";
import { ApiError } from "./problem";
import { meQuery } from "./session";

export const settingsQueryKey = ["session", "settings"] as const;

export const DEFAULT_SETTINGS: Settings = {
  week_start: 1,
  time_format: "24h",
  theme: "system",
  default_color: "brown",
  agenda_days: 30,
  week_ab: { enabled: false, anchor: null, labels: ["A", "B"] },
  version: 0,
};

export const settingsQuery = queryOptions({
  queryKey: settingsQueryKey,
  queryFn: async (): Promise<Settings> => {
    const { data, error } = await getSettings();
    if (error !== undefined) throw new ApiError(error);
    return data;
  },
  staleTime: 5 * 60_000,
});

/** The signed-in user's settings, or the defaults while they are unknown. */
export function useSettings(): Settings {
  const { data: me } = useQuery(meQuery);
  const { data } = useQuery({ ...settingsQuery, enabled: Boolean(me) });
  return data ?? DEFAULT_SETTINGS;
}
