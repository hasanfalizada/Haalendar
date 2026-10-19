// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Applies the signed-in user's settings on this device: the theme from
// the server replaces the cached one (settings sync across devices, FR-ACC-09). Used once by the shell.
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { settingsQuery } from "@/api/settings";
import { meQuery } from "@/api/session";
import { log } from "@/lib/log";
import { useTheme } from "@/theme/ThemeProvider";

export function useSettingsSync(): void {
  const { data: me } = useQuery(meQuery);
  const { data: settings } = useQuery({ ...settingsQuery, enabled: Boolean(me) });
  const { preference, setPreference } = useTheme();
  const theme = settings?.theme;

  useEffect(() => {
    if (theme === undefined || theme === preference) return;
    setPreference(theme);
    log.info("theme_synced", { theme });
  }, [theme, preference, setPreference]);
}
