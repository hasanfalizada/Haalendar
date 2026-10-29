// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. Column lists, positions and the WIP limit (D-91).
import { describe, expect, it } from "vitest";

import { cardCount, columnsOf, newColumnPosition, overLimit, positionAt, startPositions } from "./columns";
import { comparePositions } from "./position";

const rows = [
  { id: "b", board_id: "x", name: "Doing", position: "M" },
  { id: "a", board_id: "x", name: "To do", position: "C" },
  { id: "c", board_id: "x", name: "Old", position: "z", archived_at: "2026-10-01T00:00:00Z" },
  { id: "d", board_id: "x", name: "Gone", position: "Q", deleted_at: "2026-10-02T00:00:00Z" },
  { id: "e", board_id: "y", name: "Elsewhere", position: "A" },
];

describe("columns", () => {
  it("lists the active and archived columns of one board in order", () => {
    const { active, archived } = columnsOf(rows, "x");
    expect(active.map((row) => row.id)).toEqual(["a", "b"]);
    expect(archived.map((row) => row.id)).toEqual(["c"]);
  });

  it("puts a new column after every column of the board, a moved one between its new neighbours", () => {
    expect(comparePositions(newColumnPosition(rows, "x"), "z")).toBe(1);
    const active = [
      { id: "a", position: "C" },
      { id: "b", position: "M" },
      { id: "c", position: "U" },
    ];
    const first = positionAt(active, active[2] ?? {}, 0);
    expect(comparePositions(first, "C")).toBe(-1);
    const middle = positionAt(active, active[0] ?? {}, 1);
    expect([comparePositions(middle, "M"), comparePositions(middle, "U")]).toEqual([1, -1]);
    expect(comparePositions(positionAt(active, active[0] ?? {}, 2), "U")).toBe(1);
    // Two columns on one key: the moved one goes right after its left neighbour.
    const tied = [
      { id: "a", position: "M" },
      { id: "b", position: "M" },
      { id: "c", position: "U" },
    ];
    expect(comparePositions(positionAt(tied, tied[2] ?? {}, 1), "M")).toBe(1);
  });

  it("gives starting columns rising keys, counts cards and marks a column over its limit", () => {
    const keys = startPositions(3);
    expect([...keys].sort(comparePositions)).toEqual(keys);
    expect(new Set(keys).size).toBe(3);
    const items = [{ column_id: "a" }, { column_id: "a" }, { column_id: "a", deleted_at: "x" }, { column_id: "b" }];
    expect(cardCount(items, "a")).toBe(2);
    expect(overLimit({ wip_limit: 1 }, 2)).toBe(true);
    expect(overLimit({ wip_limit: 2 }, 2)).toBe(false);
    expect(overLimit({ wip_limit: null }, 9)).toBe(false);
  });
});
