// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Connection indicator (dot + label) announced politely to screen readers.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. Online it also tells the sync status (FR-OFF-03): syncing, N changes
// not sent yet, a sync error; "Connected" means everything on this device has reached the server.
// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. Unresolved conflicts come first and lead to Settings → Sync.
import { Link } from "@tanstack/react-router";
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
  if (sync.conflicts > 0) {
    label = t("status.conflicts", { count: sync.conflicts });
    tone = "warn";
  } else if (state === "online") {
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
  } else if (state === "serverUnreachable" && sync.pending > 0) {
    // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. As offline: how many changes wait for the server.
    label = t("status.unreachablePending", { count: sync.pending });
  }
  const dot = (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        tone === "ok" && "bg-ok",
        tone === "busy" && "bg-line",
        tone === "warn" && "bg-accent",
      )}
    />
  );
  const text = <span className={cn(compact && "sr-only")}>{label}</span>;
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-[12px] text-muted" title={label}>
      {sync.conflicts > 0 ? (
        // The whole indicator is the link (in the narrow rail only the dot is visible): touch-sized.
        <Link
          to="/settings"
          hash="sync"
          className="-m-2 flex min-h-11 min-w-11 items-center justify-center gap-2 p-2 underline-offset-2 hover:underline"
        >
          {dot}
          {text}
        </Link>
      ) : (
        <>
          {dot}
          {text}
        </>
      )}
    </div>
  );
}
