// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The notes of the To-Do page (FR-TODO-01/03, D-87) from the local
// database: live notes of the main list or of the archive, pinned ones first, each group by position (then id).
// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F7). Notes shared with the user (FR-ACC-10) form their own
// group in the main list ("Shared with me"; their pin is the owner's); noteAccess says what the user may do with a note.
import { type Priority, filterByPriority } from "@/atoms/items/priority";

import { comparePositions } from "./position";

type Row = Record<string, unknown>;

export type NotesTab = "notes" | "archive";

export interface NoteGroups {
  pinned: Row[];
  others: Row[];
  /** Other people's notes shared with the user (main list only; empty without `user`). */
  shared: Row[];
}

export type NoteAccess = "owner" | "edit" | "view";

/** The user's right on a note: its owner, or the permission of the user's active share of it. */
export function noteAccess(row: Row, user: string, shares: readonly Row[]): NoteAccess {
  if (row.owner_id === undefined || row.owner_id === user) return "owner";
  const share = shares.find(
    (s) =>
      s.container_kind === "note" &&
      s.container_id === row.id &&
      s.grantee_id === user &&
      !s.revoked_at &&
      !s.deleted_at,
  );
  return share?.permission === "edit" ? "edit" : "view";
}

export const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function isNote(row: Row): boolean {
  return row.kind === "note" && !row.deleted_at;
}

/** The positions of every live note (archived ones too): a new note goes before all of them. */
export function notePositions(rows: readonly Row[]): string[] {
  return rows.filter(isNote).map((row) => text(row.position));
}

function byPosition(a: Row, b: Row): number {
  return comparePositions(text(a.position), text(b.position)) || comparePositions(text(a.id), text(b.id));
}

export function noteGroups(
  rows: readonly Row[],
  tab: NotesTab,
  priorities: readonly Priority[],
  user?: string,
): NoteGroups {
  const shown = rows.filter((row) => isNote(row) && Boolean(row.archived_at) === (tab === "archive"));
  const filtered = filterByPriority(
    shown.map((row) => ({ row, priority: text(row.priority) as Priority })),
    priorities,
  ).map((entry) => entry.row);
  const sorted = [...filtered].sort(byPosition);
  // The archive has no pinned group: a pinned note keeps its pin there and gets it back when unarchived.
  if (tab === "archive") return { pinned: [], others: sorted, shared: [] };
  const own = user ? sorted.filter((row) => row.owner_id === undefined || row.owner_id === user) : sorted;
  return {
    pinned: own.filter((row) => row.pinned === true),
    others: own.filter((row) => row.pinned !== true),
    shared: user ? sorted.filter((row) => row.owner_id !== undefined && row.owner_id !== user) : [],
  };
}
