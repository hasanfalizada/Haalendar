// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Whether the browser currently allows installing the app (the user
// menu shows "Install app" only then) and the action that opens its install dialog (lib/pwa.ts, D-55).
import { useSyncExternalStore } from "react";

import { canInstall, install, subscribeInstall } from "./pwa";

export function useInstallPrompt(): { installable: boolean; install: () => Promise<boolean> } {
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  return { installable, install };
}
