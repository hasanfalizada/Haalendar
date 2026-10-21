// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Offline banner above the content (design system "Banner", warn
// colours; FR-OFF-01/05, D-55): shown while the device has no network or the server cannot be reached. Until the local
// database and outbox exist (HAAL-052) it says honestly that changes need a connection.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. Now changes to calendars and items are kept on this device and sent
// later; settings, sharing and other account actions still need a connection.
import { CloudOff, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useConnectionState } from "./useConnectionState";

export function OfflineBanner() {
  const { t } = useTranslation();
  const state = useConnectionState();
  if (state !== "offline" && state !== "serverUnreachable") return null;
  const Icon = state === "offline" ? WifiOff : CloudOff;
  return (
    <div role="status" className="flex items-start gap-2 bg-warn-bg px-4 py-2 text-[13px] text-warn-fg">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{t(state === "offline" ? "offlineBanner.offline" : "offlineBanner.unreachable")}</span>
    </div>
  );
}
