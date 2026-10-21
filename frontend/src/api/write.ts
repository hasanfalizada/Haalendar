// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. The single path for writes from the UI (FR-X-05): runs a request of
// the generated client and reports its result exactly once. Success → success toast; failure → a human-readable reason
// (no connection, no answer, changed elsewhere, invalid fields, no permission, too large, session expired, server
// error with request reference) with Retry, as a toast or, inside an open dialog, returned for the dialog to show.
// The form keeps its values on every failure. A cancelled re-authentication reports nothing (nothing was attempted).
// While a write is in flight, closing the tab asks first. A test fails if a component calls a write of the generated
// client without this wrapper (write-coverage.test.ts).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. An undoable write passes `undo`: the step is recorded after the
// success and the notification offers "Undo" (the same command as Ctrl+Z).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. The tab-close guard also asks while an editor has unsaved changes.
// onSuccess runs before the success notification, so the UI shows the saved state when "Saved" appears (otherwise an
// editor could still count as unsaved for a moment and ask needlessly when the user moves on).
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. A local write made without a connection (sync/mutate) reports
// "Saved on this device…" instead of the success message; its arrival is announced later by the sync engine. A full
// device storage (IndexedDB quota) is named as such, not as a missing connection.
import i18n from "@/i18n";
import { REAUTH_CANCELLED } from "@/components/auth/reauth";
import { describeError, log } from "@/lib/log";
import { notify } from "@/lib/notify";
import { record, type UndoStep, undo } from "@/lib/undo";
import { dirtyEditorCount } from "@/lib/unsaved";
import { isQueuedWrite } from "@/sync";

import type { Problem } from "./generated/types.gen";
import { fieldErrorsOf, isProblem, type ProblemCode } from "./problem";

/** A write that has not answered after this long is reported (the request itself may still finish). */
export const WRITE_TIMEOUT_MS = 30_000;

export type WriteFailureCode = ProblemCode | "network" | "timeout" | "http_error" | "cancelled" | "storage_full";

export interface FieldError {
  field: string;
  detail: string;
  code: string | undefined;
}

export type WriteResult<T> =
  { ok: true; data: T } | { ok: false; code: WriteFailureCode; problem: Problem | null; reason: string | null };

export interface WriteOptions<T> {
  /** Event name for the logs, e.g. "profile_save" → profile_save_ok / profile_save_failed. */
  name: string;
  /** The request: a call of the generated client (optionally wrapped in withReauth). */
  run: () => Promise<{ data?: T | undefined; error?: unknown; response?: Response | undefined }>;
  /**
   * Success message. A function may report a partial failure inside a successful answer ({ failure }, e.g. some
   * trash entries could not be restored), or null when the caller answers with a dialog instead (it must).
   */
  success: string | ((data: T) => string | { failure: string } | null);
  /** The undo step for a successful write (FR-X-06), or null when this result cannot be undone. */
  undo?: (data: T) => UndoStep | null;
  /** Called with the result of a successful attempt, the first one or a Retry. */
  onSuccess?: (data: T) => void | Promise<void>;
  /** Reasons for particular problem codes instead of the generic ones (e.g. "last administrator"). */
  reasons?: (problem: Problem) => string | null | undefined;
  /** Field errors of a 422 go to the fields; the notification then says to check them. */
  onFieldErrors?: (errors: FieldError[]) => void;
  /** "inline": an open dialog shows the returned reason itself (a toast would sit behind the modal). */
  failure?: "toast" | "inline";
  /** The edited text is also in a local draft (useDraft): the reason says it is kept on this device. */
  draft?: boolean;
  /** Offer Retry on failures where repeating can help (default true). */
  retry?: boolean;
  timeoutMs?: number;
}

// Apple keyboards say ⌘ where others say Ctrl.
const UNDO_KEYS = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘Z" : "Ctrl+Z";

let pending = 0;
let sessionExpiredHandler: (() => void) | null = null;

/** Writes still waiting for an answer (closing the tab asks first while > 0). */
export function pendingWrites(): number {
  return pending;
}

/** The shell registers how to reach the sign-in page, offered when the session has expired during a write. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** beforeunload guard; installed once by the app. Returns the remover. */
export function installUnloadGuard(): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    const dirty = dirtyEditorCount();
    if (pending === 0 && dirty === 0) return;
    log.warn("unload_held", { pending, dirty_editors: dirty });
    event.preventDefault();
  };
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => {
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}

const TIMED_OUT = Symbol("timed_out");

/** IndexedDB refused the write for lack of space (Dexie wraps it as QuotaExceededError with the inner cause). */
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const inner = (error as { inner?: unknown }).inner;
  return error.name === "QuotaExceededError" || (inner instanceof Error && inner.name === "QuotaExceededError");
}

function withTimeout<R>(promise: Promise<R>, ms: number): Promise<R | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => {
      resolve(TIMED_OUT);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Generic reason for a failure code; `kept` adds that the text is kept on this device. */
export function reasonFor(code: WriteFailureCode, status: number | null, kept: boolean): string {
  const t = i18n.t.bind(i18n);
  const keptNote = kept ? ` ${t("write.keptOnDevice")}` : "";
  switch (code) {
    case "network":
    case "requires_connection":
      return t("write.reasons.network") + keptNote;
    case "timeout":
      return t("write.reasons.timeout") + keptNote;
    case "version_conflict":
      return t("write.reasons.conflict");
    case "validation_failed":
    case "bad_request":
      return t("write.reasons.invalid");
    case "forbidden":
    case "reauth_required":
      return t("write.reasons.forbidden");
    case "not_found":
      return t("write.reasons.notFound");
    case "payload_too_large":
      return t("write.reasons.tooLarge");
    case "unsupported_media_type":
      return t("write.reasons.unsupportedType");
    case "rate_limited":
      return t("write.reasons.rateLimited");
    case "session_expired":
      return t("write.reasons.sessionExpired") + keptNote;
    case "csrf_failed":
      return t("write.reasons.securityCheck") + keptNote;
    case "duplicate":
      return t("write.reasons.duplicate");
    case "invalid_state":
      return t("write.reasons.invalidState");
    case "storage_full":
      return t("write.reasons.storageFull");
    default:
      return status !== null && status >= 500 ? t("write.reasons.server") + keptNote : t("write.reasons.generic");
  }
}

const RETRYABLE: ReadonlySet<WriteFailureCode> = new Set([
  "network",
  "requires_connection",
  "timeout",
  "internal_error",
  "http_error",
  "rate_limited",
]);

export async function runWrite<T>(options: WriteOptions<T>): Promise<WriteResult<T>> {
  const inline = options.failure === "inline";
  const kept = options.draft ?? false;

  const fail = (code: WriteFailureCode, problem: Problem | null, status: number | null): WriteResult<T> => {
    const custom = problem ? options.reasons?.(problem) : null;
    const reason = custom ?? reasonFor(code, status, kept);
    log.warn(`${options.name}_failed`, { code, status, request_id: problem?.request_id ?? null });
    if (!inline) {
      const retryable = (options.retry ?? true) && (RETRYABLE.has(code) || (status !== null && status >= 500));
      notify.failure(reason, {
        ...(retryable ? { retry: () => void runWrite(options) } : {}),
        ...(code === "session_expired" && sessionExpiredHandler
          ? { action: { label: i18n.t("write.signIn"), run: sessionExpiredHandler } }
          : {}),
        reference: status !== null && status >= 500 ? (problem?.request_id ?? null) : null,
      });
    }
    return { ok: false, code, problem, reason };
  };

  pending += 1;
  let outcome: Awaited<ReturnType<typeof options.run>> | typeof TIMED_OUT;
  try {
    outcome = await withTimeout(options.run(), options.timeoutMs ?? WRITE_TIMEOUT_MS);
  } catch (error) {
    if (isQuotaError(error)) return fail("storage_full", null, null);
    log.warn(`${options.name}_unreachable`, { error: describeError(error) });
    return fail("network", null, null);
  } finally {
    pending -= 1;
  }

  if (outcome === TIMED_OUT) return fail("timeout", null, null);
  const { data, error, response } = outcome;
  if (error === REAUTH_CANCELLED) {
    log.info(`${options.name}_cancelled`);
    return { ok: false, code: "cancelled", problem: null, reason: null };
  }
  if (error !== undefined) {
    const status = response?.status ?? (isProblem(error) ? error.status : null);
    // The generated client returns a failed fetch as an error without a response: the server was not reached.
    if (!isProblem(error)) return fail(response ? "http_error" : "network", null, status);
    if (error.code === "validation_failed") options.onFieldErrors?.(fieldErrorsOf(error));
    return fail(error.code, error, status);
  }

  log.info(`${options.name}_ok`);
  const result = data as T; // no error → the generated client has parsed the body
  await options.onSuccess?.(result);
  const message = typeof options.success === "function" ? options.success(result) : options.success;
  const step = options.undo?.(result) ?? null;
  if (step) record(step);
  if (typeof message === "string" && isQueuedWrite(result)) {
    notify.queued();
  } else if (typeof message === "string") {
    notify.success(
      message,
      step
        ? {
            action: { label: i18n.t("undo.action"), run: () => void undo(step.id) },
            hint: i18n.t("undo.hint", { keys: UNDO_KEYS }),
          }
        : {},
    );
  } else if (message) notify.failure(message.failure);
  return { ok: true, data: result };
}
