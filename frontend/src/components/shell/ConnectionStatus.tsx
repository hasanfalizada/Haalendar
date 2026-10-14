// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Connection indicator (dot + label) announced politely to screen readers.
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { useConnectionState } from "./useConnectionState";

export function ConnectionStatus({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const state = useConnectionState();
  const label = t(`status.${state}`);
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-[12px] text-muted" title={label}>
      <span
        aria-hidden
        className={cn(
          "size-2.5 rounded-full",
          state === "online" && "bg-ok",
          state === "checking" && "bg-line",
          (state === "offline" || state === "serverUnreachable") && "bg-accent",
        )}
      />
      <span className={cn(compact && "sr-only")}>{label}</span>
    </div>
  );
}
