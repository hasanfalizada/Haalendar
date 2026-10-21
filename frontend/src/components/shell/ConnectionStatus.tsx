// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Connection indicator (dot + label) announced politely to screen readers.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. Online it also tells the sync status (FR-OFF-03): syncing, N changes
// not sent yet, a sync error; "Connected" means everything on this device has reached the server.
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useSyncStatus } from "@/sync";

import { useConnectionState } from "./useConnectionState";

export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const state = useConnectionState();
  const sync = useSyncStatus();
  let label = t(`status.${state}`);
  let tone: "ok" | "busy" | "warn" = state === "online" ? "ok" : state === "checking" ? "busy" : "warn";
  if (state === "online") {
    if (sync.state === "error" || sync.state === "paused") {
      label = t(sync.state === "error" ? "status.syncError" : "status.syncPaused");
      tone = "warn";
    } else if (sync.state === "syncing") {
      label = t("status.syncing");
      tone = "busy";
    } else if (sync.pending > 0) {
      label = t("status.pending", { count: sync.pending });
      tone = "busy";
    }
  } else if (state === "offline" && sync.pending > 0) {
    label = t("status.offlinePending", { count: sync.pending });
  }
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-[12px] text-muted" title={label}>
      <span
        aria-hidden
        className={cn(
          "size-2.5 rounded-full",
          tone === "ok" && "bg-ok",
          tone === "busy" && "bg-line",
          tone === "warn" && "bg-accent",
        )}
      />
      <span className={cn(compact && "sr-only")}>{label}</span>
    </div>
  );
}
