// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Bulk actions on a selection (FR-X-07, D-41): one request to
// POST /bulk, one notification, one undo step. delete ↔ restore of the same rows; a color or priority change is undone
// with every row's previous value in one request. The versions of the answer go into the undo step (If-Match
// semantics per row). All-or-nothing: when the server refuses, the reason says how many of the selection blocked it
// and refusedIds() names them, so the list can be refreshed and the selection kept.
import { bulkOperation } from "@/api/generated/sdk.gen";
import type { BulkItemResult, BulkType, Color, Priority, Problem } from "@/api/generated/types.gen";
import { runWrite, type WriteResult } from "@/api/write";
import i18n from "@/i18n";

import { newStep, registerUndo, type UndoLabel, type UndoStep } from "./undo";

export type BulkAction = "delete" | "restore" | "set_color" | "set_priority" | "move_next_day";

export interface BulkSelected {
  type: BulkType;
  id: string;
  version: number;
  /** Current color / priority: needed to undo a color / priority change. */
  color?: Color;
  priority?: Priority;
  occurrence_date?: string;
}

interface UndoTarget {
  type: BulkType;
  id: string;
  version: number;
  before?: string;
  after?: string;
}

interface BulkUndo {
  action: "delete" | "restore" | "set_color" | "set_priority";
  targets: UndoTarget[];
}

interface BulkAnswer {
  applied: number;
  delete_batch_id: string | null;
  items: BulkItemResult[];
}

function send(action: Exclude<BulkAction, "move_next_day">, targets: UndoTarget[], value: "before" | "after") {
  const field = action === "set_color" ? "color" : action === "set_priority" ? "priority" : null;
  return () =>
    bulkOperation({
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: {
        action,
        targets: targets.map((t) => ({
          type: t.type,
          id: t.id,
          version: t.version,
          ...(field && t[value] ? { [field]: t[value] } : {}),
        })),
      },
    });
}

function withVersions(data: unknown, payload: BulkUndo): BulkUndo {
  const versions = new Map((data as BulkAnswer).items.map((item) => [`${item.type}:${item.id}`, item.version]));
  return {
    ...payload,
    targets: payload.targets.map((t) => ({ ...t, version: versions.get(`${t.type}:${t.id}`) ?? t.version })),
  };
}

registerUndo<BulkUndo>("bulk", {
  undo: (p) => ({
    run:
      p.action === "delete"
        ? send("restore", p.targets, "before")
        : p.action === "restore"
          ? send("delete", p.targets, "before")
          : send(p.action, p.targets, "before"),
    next: withVersions,
  }),
  redo: (p) => ({ run: send(p.action, p.targets, "after"), next: withVersions }),
});

function undoStep(
  action: BulkAction,
  items: BulkSelected[],
  value: string | undefined,
  data: BulkAnswer,
  label: UndoLabel,
) {
  if (action === "move_next_day") return null; // undone by the events module once it exists (HAAL-08x)
  const versions = new Map(data.items.map((item) => [`${item.type}:${item.id}`, item.version]));
  const field = action === "set_color" ? "color" : action === "set_priority" ? "priority" : null;
  const targets: UndoTarget[] = items.map((item) => ({
    type: item.type,
    id: item.id,
    version: versions.get(`${item.type}:${item.id}`) ?? item.version,
    ...(field ? { before: item[field], after: value } : {}),
  }));
  // Without the previous values a color / priority change cannot be undone.
  if (field && targets.some((t) => t.before === undefined)) return null;
  return newStep<BulkUndo>("bulk", label, { action, targets });
}

export interface BulkRequest {
  action: BulkAction;
  items: BulkSelected[];
  /** Color for set_color, priority for set_priority. */
  value?: Color | Priority;
  /** Undo label, e.g. { key: "bulk.labels.delete", values: { count: "3" } }. */
  label: UndoLabel;
  success: string;
}

function refusedReason(problem: Problem, total: number): string | null {
  const count = (problem.errors ?? []).filter((e) => /^\/targets\/\d+/.test(e.pointer)).length;
  if (count === 0) return null;
  return i18n.t(problem.code === "version_conflict" ? "bulk.conflict" : "bulk.refused", { count, total });
}

export function runBulk(request: BulkRequest): Promise<WriteResult<BulkAnswer>> {
  const { action, items, value } = request;
  const field = action === "set_color" ? "color" : action === "set_priority" ? "priority" : null;
  return runWrite<BulkAnswer>({
    name: `bulk_${action}`,
    run: () =>
      bulkOperation({
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          action,
          targets: items.map((item) => ({
            type: item.type,
            id: item.id,
            version: item.version,
            ...(item.occurrence_date ? { occurrence_date: item.occurrence_date } : {}),
          })),
          ...(field && value ? { [field]: value } : {}),
        },
      }),
    success: request.success,
    reasons: (problem) => refusedReason(problem, items.length),
    undo: (data): UndoStep | null => undoStep(action, items, value, data, request.label),
  });
}

/** Ids of the selected rows the server refused (from the /targets/{index} pointers). */
export function refusedIds(result: WriteResult<unknown>, items: BulkSelected[]): string[] {
  if (result.ok || !result.problem) return [];
  return (result.problem.errors ?? [])
    .map((e) => /^\/targets\/(\d+)/.exec(e.pointer)?.[1])
    .flatMap((index) => (index === undefined ? [] : [items[Number(index)]?.id ?? ""]))
    .filter(Boolean);
}
