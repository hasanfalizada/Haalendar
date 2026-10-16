// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo / redo (FR-X-06, D-13, D-40). A step is data — kind, label
// (translation key + values) and payload — so the history survives a reload of the tab (sessionStorage) and can travel
// through the offline outbox later (HAAL-052); handlers registered per kind turn it into the inverse request. 50 steps,
// a new action clears redo, a bulk action is one step (kind "batch"), steps run one after another. Undo and redo go
// through runWrite and report themselves; a step whose record was changed meanwhile cannot be undone and is dropped,
// a step that failed for lack of connection stays for another try. History belongs to one user and is cleared on
// sign-out.
import i18n from "@/i18n";
import { runWrite, type WriteFailureCode } from "@/api/write";

import { log } from "./log";
import { notify } from "./notify";

export const UNDO_LIMIT = 50;
const STORAGE_KEY = "haalendar.undo";

export interface UndoLabel {
  key: string;
  values?: Record<string, string>;
}

export interface UndoStep<P = unknown> {
  id: string;
  kind: string;
  label: UndoLabel;
  payload: P;
  /** Batch interrupted half-way: the parts already done in this direction (with their updated payloads). */
  carry?: UndoStep[];
}

type Request = () => Promise<{ data?: unknown; error?: unknown; response?: Response | undefined }>;

export interface UndoOperation<P> {
  run: Request;
  /** Payload for the opposite direction after this request succeeded (e.g. a new version or id). */
  next?: (data: unknown, payload: P) => P;
}

export interface UndoHandler<P> {
  undo: (payload: P) => UndoOperation<P>;
  redo: (payload: P) => UndoOperation<P>;
}

interface History {
  user: string | null;
  done: UndoStep[];
  undone: UndoStep[];
}

const handlers = new Map<string, UndoHandler<unknown>>();
const listeners = new Set<() => void>();
const appliedListeners = new Set<() => void>();
let history: History = read();
let queue: Promise<unknown> = Promise.resolve();

/** Codes after which the step can never succeed: the record was changed, re-created or is gone. */
const STALE: ReadonlySet<WriteFailureCode> = new Set([
  "version_conflict",
  "not_found",
  "duplicate",
  "invalid_state",
  "forbidden",
  "validation_failed",
]);

function read(): History {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as History;
      if (Array.isArray(parsed.done) && Array.isArray(parsed.undone)) return parsed;
    }
  } catch {
    // Storage unavailable or damaged: start empty.
  }
  return { user: null, done: [], undone: [] };
}

function commit(next: History): void {
  history = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode): the history lives in memory only.
  }
  listeners.forEach((listener) => {
    listener();
  });
}

export function registerUndo<P>(kind: string, handler: UndoHandler<P>): void {
  handlers.set(kind, handler as unknown as UndoHandler<unknown>);
}

/** The signed-in user owns the history; another user (or none) starts with an empty one. */
export function bindUndoUser(user: string | null): void {
  if (history.user === user) return;
  commit({ user, done: [], undone: [] });
}

export function clearUndo(): void {
  commit({ user: history.user, done: [], undone: [] });
  log.info("undo_history_cleared");
}

export function newStep<P>(kind: string, label: UndoLabel, payload: P): UndoStep<P> {
  return { id: crypto.randomUUID(), kind, label, payload };
}

/** Several steps undone and redone together (bulk action). */
export function batchStep(label: UndoLabel, steps: UndoStep[]): UndoStep<UndoStep[]> {
  return newStep("batch", label, steps);
}

export function record(step: UndoStep): void {
  if (!handlers.has(step.kind)) throw new Error(`No undo handler for "${step.kind}"`);
  commit({ ...history, done: [...history.done, step].slice(-UNDO_LIMIT), undone: [] });
  log.debug("undo_step_recorded", { kind: step.kind, depth: history.done.length });
}

export function undoState(): { canUndo: boolean; canRedo: boolean; depth: number } {
  return { canUndo: history.done.length > 0, canRedo: history.undone.length > 0, depth: history.done.length };
}

export function subscribeUndo(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called after an undo or redo changed data on the server (the shell refreshes what is shown). */
export function subscribeUndoApplied(listener: () => void): () => void {
  appliedListeners.add(listener);
  return () => {
    appliedListeners.delete(listener);
  };
}

export function labelText(label: UndoLabel): string {
  // Labels are stored as data (key + values), so the key is only known at run time.
  const translate = i18n.t.bind(i18n) as unknown as (key: string, values: Record<string, string>) => string;
  return translate(label.key, label.values ?? {});
}

interface Outcome {
  ok: boolean;
  /** The step can never succeed (record changed meanwhile). */
  stale: boolean;
  /** The step as it stays on the history: updated payload, or for a half-done batch only the parts still to do. */
  step: UndoStep;
  reason?: string | null;
}

async function perform(step: UndoStep, direction: "undo" | "redo"): Promise<Outcome> {
  if (step.kind !== "batch") return operate(step, direction);
  // Undo walks the parts backwards. After a failure the step keeps the parts still to do as payload and carries the
  // finished ones, so another try does not repeat them and the opposite direction later covers all parts.
  const parts = step.payload as UndoStep[];
  const order = direction === "undo" ? [...parts].reverse() : [...parts];
  const finished: UndoStep[] = [...(step.carry ?? [])];
  for (const [index, part] of order.entries()) {
    const result = await operate(part, direction);
    if (!result.ok) {
      const remaining = order.slice(index);
      return {
        ok: false,
        stale: result.stale,
        reason: result.reason ?? null,
        step: { ...step, payload: direction === "undo" ? remaining.reverse() : remaining, carry: finished },
      };
    }
    finished.push(result.step);
  }
  const whole: UndoStep = { ...step };
  delete whole.carry;
  return { ok: true, stale: false, step: { ...whole, payload: direction === "undo" ? finished.reverse() : finished } };
}

async function operate(step: UndoStep, direction: "undo" | "redo"): Promise<Outcome> {
  const handler = handlers.get(step.kind);
  if (!handler) return { ok: false, stale: true, step };
  const operation = handler[direction](step.payload);
  const result = await runWrite({
    name: `${direction}_${step.kind}`,
    run: operation.run,
    // The step reports as a whole (see run below); batches would otherwise show one toast per part.
    success: () => null,
    failure: "inline",
  });
  if (!result.ok) return { ok: false, stale: STALE.has(result.code), step, reason: result.reason };
  const payload = operation.next ? operation.next(result.data, step.payload) : step.payload;
  return { ok: true, stale: false, step: { ...step, payload } };
}

function run(direction: "undo" | "redo", stepId?: string): Promise<void> {
  const task = queue.then(async () => {
    const source = direction === "undo" ? history.done : history.undone;
    const step = stepId ? source.find((s) => s.id === stepId) : source[source.length - 1];
    if (!step) {
      if (!stepId) notify.info(i18n.t(direction === "undo" ? "undo.nothingToUndo" : "undo.nothingToRedo"));
      return;
    }
    const outcome = await perform(step, direction);
    const rest = source.filter((s) => s.id !== step.id);
    if (outcome.ok) {
      const target = direction === "undo" ? history.undone : history.done;
      const moved = [...target, outcome.step].slice(-UNDO_LIMIT);
      commit(
        direction === "undo" ? { ...history, done: rest, undone: moved } : { ...history, done: moved, undone: rest },
      );
      log.info(`${direction}_done`, { kind: step.kind });
      appliedListeners.forEach((listener) => {
        listener();
      });
      notify.success(i18n.t(direction === "undo" ? "undo.undone" : "undo.redone", { label: labelText(step.label) }));
      return;
    }
    if (outcome.stale) {
      commit(direction === "undo" ? { ...history, done: rest } : { ...history, undone: rest });
      log.warn(`${direction}_stale`, { kind: step.kind });
      notify.failure(
        i18n.t(direction === "undo" ? "undo.cannotUndo" : "undo.cannotRedo", { label: labelText(step.label) }),
      );
      return;
    }
    // No connection, no answer, server error: the step stays (what is left of it); Ctrl+Z / Ctrl+Shift+Z tries again.
    const kept = source.map((s) => (s.id === step.id ? outcome.step : s));
    commit(direction === "undo" ? { ...history, done: kept } : { ...history, undone: kept });
    log.warn(`${direction}_failed`, { kind: step.kind });
    notify.failure(outcome.reason ?? i18n.t("write.reasons.generic"));
  });
  queue = task.catch(() => undefined);
  return task;
}

/** Undo the latest step, or the given one (Undo button in a notification). */
export function undo(stepId?: string): Promise<void> {
  return run("undo", stepId);
}

export function redo(): Promise<void> {
  return run("redo");
}

registerUndo<UndoStep[]>("batch", {
  // Batches are handled by perform(); the registration only marks the kind as known.
  undo: () => ({ run: () => Promise.resolve({ data: null }) }),
  redo: () => ({ run: () => Promise.resolve({ data: null }) }),
});
