// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Result notifications (FR-X-05, design system "Result feedback"): one
// toast per write. Success hides after 4 s and has room for an action (Undo arrives with HAAL-035); a failure stays
// until dismissed and carries the reason, a Retry button and, for server errors, a short request reference. "Queued"
// and "synced" are emitted by the offline outbox (HAAL-052/053). UI code reports writes through runWrite
// (api/write.ts); these functions are its single outlet and the outbox's. The toast region is a polite live region;
// a failure is wrapped in role="alert" so screen readers announce it at once.
import { toast } from "sonner";

import i18n from "@/i18n";

export const SUCCESS_MS = 4_000;

export interface NotifyAction {
  label: string;
  run: () => void;
}

export interface FailureOptions {
  /** Repeat the failed write; shown as "Retry". */
  retry?: () => void;
  /** Another way out, e.g. "Sign in" when the session has expired. */
  action?: NotifyAction;
  /** Request id of a server-side failure, shown shortened so the log line can be found. */
  reference?: string | null;
}

function button(action: NotifyAction | undefined) {
  return action ? { label: action.label, onClick: action.run } : undefined;
}

export const notify = {
  success(text: string, options: { action?: NotifyAction; hint?: string } = {}): string | number {
    return toast.success(text, { duration: SUCCESS_MS, action: button(options.action), description: options.hint });
  },

  /** A neutral message, e.g. "Nothing to undo". */
  info(text: string): string | number {
    return toast.info(text, { duration: SUCCESS_MS });
  },

  failure(text: string, options: FailureOptions = {}): string | number {
    const action = options.retry ? { label: i18n.t("common.retry"), run: options.retry } : options.action;
    return toast.error(<span role="alert">{text}</span>, {
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
      description: options.reference ? i18n.t("notify.reference", { id: options.reference.slice(0, 8) }) : undefined,
      action: button(action),
      // A Retry and a second way out (sign in) can both apply.
      cancel: options.retry && options.action ? button(options.action) : undefined,
    });
  },

  /** A change was stored on this device and waits for the connection (offline outbox, HAAL-052). */
  queued(count = 1): string | number {
    return toast.info(i18n.t("notify.queued", { count }), { duration: SUCCESS_MS });
  },

  /** Queued changes reached the server (HAAL-053). */
  synced(count: number): string | number {
    return toast.success(i18n.t("notify.synced", { count }), { duration: SUCCESS_MS });
  },

  dismissAll(): void {
    toast.dismiss();
  },
};
