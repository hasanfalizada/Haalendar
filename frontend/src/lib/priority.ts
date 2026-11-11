// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. The priority filter in the address (D-46): `?priority=high,medium`
// — shareable, kept on reload. Unknown values are dropped; the order follows high → low; an empty list means "all" and
// is left out of the address.
import { PRIORITIES, type Priority } from "@/atoms/items/priority";

export function parsePriorityParam(value: unknown): Priority[] {
  if (typeof value !== "string" || value === "") return [];
  const given = new Set(value.split(","));
  return PRIORITIES.filter((p) => given.has(p));
}

export function formatPriorityParam(value: readonly Priority[]): string | undefined {
  const ordered = PRIORITIES.filter((p) => value.includes(p));
  return ordered.length > 0 ? ordered.join(",") : undefined;
}
