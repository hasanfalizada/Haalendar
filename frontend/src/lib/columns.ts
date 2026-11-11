// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The columns of a board (FR-KAN-02, D-91) from the local rows: the
// active ones left to right (position, then name) and the archived ones; positions for a new column (after every column
// of the board, archived ones too), for a column moved to another place among the active ones, and for the columns a
// new board starts with; the cards in a column and whether it is over its WIP limit.
import { comparePositions, keyBetween } from "./position";

type Row = Record<string, unknown>;

const positionOf = (row: Row) => (typeof row.position === "string" ? row.position : "");

const inOrder = (a: Row, b: Row) =>
  comparePositions(positionOf(a), positionOf(b)) || String(a.name).localeCompare(String(b.name));

export interface BoardColumns {
  active: Row[];
  archived: Row[];
}

export function columnsOf(rows: readonly Row[], boardId: string): BoardColumns {
  const live = rows.filter((row) => row.board_id === boardId && !row.deleted_at);
  return {
    active: live.filter((row) => !row.archived_at).sort(inOrder),
    archived: live.filter((row) => row.archived_at).sort(inOrder),
  };
}

/** After every column of the board, archived ones too. */
export function newColumnPosition(rows: readonly Row[], boardId: string): string {
  const last = rows
    .filter((row) => row.board_id === boardId)
    .map(positionOf)
    .reduce<string>((highest, key) => (comparePositions(key, highest) > 0 ? key : highest), "");
  return keyBetween(last, null);
}

/** The position that puts `moving` at `index` among the active columns (counted without it). */
export function positionAt(active: readonly Row[], moving: Row, index: number): string {
  const others = active.filter((row) => row.id !== moving.id);
  const before = others[index - 1];
  const after = others[index];
  const low = before ? positionOf(before) : "";
  const high = after ? positionOf(after) : null;
  // Two columns on the same key (made on two devices at once): the moved one goes right after the left one.
  return high !== null && comparePositions(low, high) >= 0 ? keyBetween(low, null) : keyBetween(low, high);
}

/** Positions of `count` columns in a row on an empty board. */
export function startPositions(count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) keys.push(keyBetween(keys[i - 1] ?? "", null));
  return keys;
}

/** The live cards in a column (cards arrive with HAAL-112). */
export function cardCount(items: readonly Row[], columnId: string): number {
  return items.filter((item) => item.column_id === columnId && !item.deleted_at).length;
}

export function overLimit(column: Row, cards: number): boolean {
  return typeof column.wip_limit === "number" && cards > column.wip_limit;
}
