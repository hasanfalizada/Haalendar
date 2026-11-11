// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. The user's Kanban boards (FR-KAN-01, D-90) from the local rows: own
// boards, boards shared with the user and own archived ones, each in board order (position, then name); a new board
// goes after the user's last one.
import { comparePositions, keyBetween } from "./position";

type Row = Record<string, unknown>;

export interface BoardLists {
  own: Row[];
  shared: Row[];
  archived: Row[];
}

const positionOf = (row: Row) => (typeof row.position === "string" ? row.position : "");

const inOrder = (a: Row, b: Row) =>
  comparePositions(positionOf(a), positionOf(b)) || String(a.name).localeCompare(String(b.name));

export function boardLists(rows: readonly Row[], user: string): BoardLists {
  const live = rows.filter((row) => !row.deleted_at);
  return {
    own: live.filter((row) => row.owner_id === user && !row.archived_at).sort(inOrder),
    shared: live.filter((row) => row.owner_id !== user && !row.archived_at).sort(inOrder),
    archived: live.filter((row) => row.owner_id === user && row.archived_at).sort(inOrder),
  };
}

/** The position of a new board: after every board the user owns (archived ones too). */
export function newBoardPosition(rows: readonly Row[], user: string): string {
  const last = rows
    .filter((row) => row.owner_id === user && typeof row.position === "string")
    .map((row) => String(row.position))
    .reduce<string>((highest, key) => (comparePositions(key, highest) > 0 ? key : highest), "");
  return keyBetween(last, null);
}
