// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards of a column, a new card's place, labels on a card, the due text.
import { describe, expect, it } from "vitest";

import { cardsOf, dueText, labelsOf, newCardPosition } from "./cards";
import { comparePositions } from "./position";

const items = [
  { id: "b", kind: "card", column_id: "x", title: "Beta", position: "M" },
  { id: "a", kind: "card", column_id: "x", title: "Alpha", position: "C" },
  { id: "d", kind: "card", column_id: "x", title: "Gone", position: "z", deleted_at: "2026-10-01T00:00:00Z" },
  { id: "e", kind: "card", column_id: "y", title: "Elsewhere", position: "A" },
  { id: "n", kind: "note", column_id: "x", title: "Note", position: "B" },
];

describe("cards", () => {
  it("lists the live cards of a column in order and puts a new one after every card of it", () => {
    expect(cardsOf(items, "x").map((row) => row.id)).toEqual(["a", "b"]);
    // After the deleted one too: its place is kept for a restore.
    expect(comparePositions(newCardPosition(items, "x"), "z")).toBe(1);
    expect(newCardPosition(items, "empty")).toBe("V");
  });

  it("names the live labels on a card in name order", () => {
    const labels = [
      { id: "l1", name: "Urgent" },
      { id: "l2", name: "Bug" },
      { id: "l3", name: "Old", deleted_at: "2026-10-01T00:00:00Z" },
    ];
    const on = [
      { item_id: "a", label_id: "l1" },
      { item_id: "a", label_id: "l2" },
      { item_id: "a", label_id: "l3" },
      { item_id: "a", label_id: "l2", deleted_at: "2026-10-02T00:00:00Z" },
      { item_id: "b", label_id: "l1" },
    ];
    expect(labelsOf("a", on, labels).map((label) => label.name)).toEqual(["Bug", "Urgent"]);
  });

  it("shows the due date with its time, the year only when it is another year", () => {
    expect(dueText({ due_date: "2026-11-10" }, "en", "24h", 2026)).toBe("Nov 10");
    expect(dueText({ due_date: "2026-11-10", due_time: "09:30" }, "en", "24h", 2026)).toBe("Nov 10, 09:30");
    expect(dueText({ due_date: "2027-01-05", due_time: "21:00" }, "en", "12h", 2026)).toBe("Jan 5, 2027, 9:00 PM");
    expect(dueText({}, "en", "24h", 2026)).toBeNull();
  });
});
