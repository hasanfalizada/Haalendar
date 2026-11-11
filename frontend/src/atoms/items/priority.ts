// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. Atom items.priority.v1 (contract:
// atoms/items.priority.v1/contract.json; FR-X-12, D-04, D-46): default, order and filter of item priorities — the same
// rules the server applies in SQL, so local (also offline) sorting and filtering match it.
export type Priority = "low" | "medium" | "high";
export const PRIORITIES: readonly Priority[] = ["high", "medium", "low"];
export const DEFAULT_PRIORITY: Priority = "medium";
const RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function normalize(value: Priority | null | undefined): Priority {
  return value ?? DEFAULT_PRIORITY;
}

export function rank(value: Priority | null | undefined): number {
  return RANK[normalize(value)];
}

export interface Ranked {
  id: string;
  priority: Priority | null | undefined;
  tiebreak: string | number;
}

function compareKeys(a: string | number, b: string | number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Comparator: high → low, then tiebreak ascending, then id. */
export function comparePriority(a: Ranked, b: Ranked): number {
  return rank(b.priority) - rank(a.priority) || compareKeys(a.tiebreak, b.tiebreak) || compareKeys(a.id, b.id);
}

export function sortByPriority<T extends Ranked>(items: readonly T[]): T[] {
  return [...items].sort(comparePriority);
}

/** Items whose priority is in `allowed` (empty = all), in their original order. */
export function filterByPriority<T extends { priority: Priority | null | undefined }>(
  items: readonly T[],
  allowed: readonly Priority[],
): T[] {
  if (allowed.length === 0) return [...items];
  const wanted = new Set(allowed);
  return items.filter((item) => wanted.has(normalize(item.priority)));
}
