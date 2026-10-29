// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. Board lists and the position of a new board (D-90).
import { describe, expect, it } from "vitest";

import { boardLists, newBoardPosition } from "./boards";
import { comparePositions } from "./position";

const rows = [
  { id: "b", owner_id: "me", name: "Beta", position: "M" },
  { id: "a", owner_id: "me", name: "Alpha", position: "M" },
  { id: "c", owner_id: "me", name: "Cold", position: "z", archived_at: "2026-10-01T00:00:00Z" },
  { id: "s", owner_id: "bob", name: "Shared", position: "A" },
  { id: "d", owner_id: "me", name: "Gone", position: "B", deleted_at: "2026-10-02T00:00:00Z" },
];

describe("boards", () => {
  it("splits own, shared and archived boards, each by position then name, without deleted ones", () => {
    const lists = boardLists(rows, "me");
    expect(lists.own.map((row) => row.id)).toEqual(["a", "b"]);
    expect(lists.shared.map((row) => row.id)).toEqual(["s"]);
    expect(lists.archived.map((row) => row.id)).toEqual(["c"]);
  });

  it("puts a new board after every own board", () => {
    expect(comparePositions(newBoardPosition(rows, "me"), "z")).toBe(1);
    expect(newBoardPosition([], "me")).toBe("V");
  });
});
