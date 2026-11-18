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

// +++===+++ 2026-11-17 22:40 +04 — Hasan Alizada — HAAL-102. Labels of notes (FR-TODO-04, D-109): personal — a label
// without a board belongs to its user, who puts it on any note they read; nobody else sees it. The filter shows the
// notes with any of the chosen labels; a chosen label that is gone no longer filters.

/** At most this many personal labels per user, and of them on one note (as the server, D-109). */
export const PERSONAL_LABELS_MAX = 100;
export const NOTE_LABELS_MAX = 20;

/**
 * The user's live personal labels, by name. One made on this device and not synced yet has no container: without a
 * board it can only be the user's own.
 */
export function personalLabels(labels: readonly Row[], user: string): Row[] {
  return labels
    .filter(
      (row) => row.board_id == null && (row.container_id === undefined || row.container_id === user) && !row.deleted_at,
    )
    .sort((a, b) => text(a.name).localeCompare(text(b.name)));
}

/** The ids of the given labels on each note (live rows only). */
export function labelsByNote(itemLabels: readonly Row[], labels: readonly Row[]): Map<string, string[]> {
  const live = new Set(labels.map((row) => String(row.id)));
  const byNote = new Map<string, string[]>();
  for (const row of itemLabels) {
    if (row.deleted_at || !live.has(String(row.label_id))) continue;
    const note = String(row.item_id);
    byNote.set(note, [...(byNote.get(note) ?? []), String(row.label_id)]);
  }
  return byNote;
}

/** The notes with any of the chosen labels (the chosen ones still alive); every row when none is chosen. */
export function filterByLabels(
  rows: readonly Row[],
  chosen: readonly string[],
  byNote: Map<string, string[]>,
  labels: readonly Row[],
): Row[] {
  const live = new Set(labels.map((row) => String(row.id)));
  const wanted = chosen.filter((id) => live.has(id));
  if (wanted.length === 0) return [...rows];
  return rows.filter((row) => (byNote.get(String(row.id)) ?? []).some((id) => wanted.includes(id)));
}

const ID = /^[0-9a-f-]{36}$/i;

/** `?labels=<id>,<id>` of the To-Do page (anything else dropped). */
export function parseLabelsParam(value: unknown): string[] {
  return typeof value === "string" && value ? value.split(",").filter((id) => ID.test(id)) : [];
}

export function formatLabelsParam(ids: readonly string[]): string | undefined {
  return ids.length > 0 ? [...ids].sort().join(",") : undefined;
}
