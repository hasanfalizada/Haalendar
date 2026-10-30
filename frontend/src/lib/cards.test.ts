// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards of a column, a new card's place, labels on a card, the due text.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. A moved card's position and where Alt+arrows take it.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-117. Overdue and due soon at their edges (also across a clock change).
import { describe, expect, it } from "vitest";

import {
  cardPositionAt,
  cardStepTarget,
  cardsOf,
  dueState,
  dueText,
  isCardAt,
  labelsOf,
  newCardPosition,
} from "./cards";
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

  it("puts a moved card between its new neighbours, at the top, at the end or into an empty column", () => {
    const [alpha, beta] = cardsOf(items, "x") as [Record<string, unknown>, Record<string, unknown>];
    const moved = (columnId: string, index: number, card = beta) => {
      const position = cardPositionAt(items, card, columnId, index);
      const after = items.map((row) => (row.id === card.id ? { ...row, column_id: columnId, position } : row));
      return cardsOf(after, columnId).map((row) => row.id);
    };
    expect(moved("x", 0)).toEqual(["b", "a"]);
    expect(moved("y", 0)).toEqual(["b", "e"]);
    expect(moved("y", 1)).toEqual(["e", "b"]);
    expect(moved("empty", 0)).toEqual(["b"]);
    expect(isCardAt(items, alpha, { columnId: "x", index: 0 })).toBe(true);
    expect(isCardAt(items, alpha, { columnId: "x", index: 1 })).toBe(false);
    expect(isCardAt(items, alpha, { columnId: "y", index: 0 })).toBe(false);
    // Two cards on one key (made on two devices at once): the moved one goes right after the one above.
    const twins = [
      { id: "p", kind: "card", column_id: "x", title: "P", position: "M" },
      { id: "q", kind: "card", column_id: "x", title: "Q", position: "M" },
      { id: "r", kind: "card", column_id: "x", title: "R", position: "a" },
    ];
    const position = cardPositionAt(twins, twins[2] as Record<string, unknown>, "x", 1);
    expect(comparePositions(position, "M")).toBe(1);
  });

  it("takes a card one up or down in its column or to the same place in the column beside, stopping at the edges", () => {
    const rows = [
      ...items,
      { id: "f", kind: "card", column_id: "y", title: "F", position: "B" },
      { id: "g", kind: "card", column_id: "z", title: "G", position: "B" },
    ];
    const columns = ["x", "y", "z"];
    const card = (id: string) => rows.find((row) => row.id === id) as Record<string, unknown>;
    expect(cardStepTarget(rows, columns, card("a"), "up")).toBeNull();
    expect(cardStepTarget(rows, columns, card("a"), "down")).toEqual({ columnId: "x", index: 1 });
    expect(cardStepTarget(rows, columns, card("b"), "up")).toEqual({ columnId: "x", index: 0 });
    expect(cardStepTarget(rows, columns, card("b"), "down")).toBeNull();
    expect(cardStepTarget(rows, columns, card("a"), "left")).toBeNull();
    expect(cardStepTarget(rows, columns, card("b"), "right")).toEqual({ columnId: "y", index: 1 });
    // The column beside is shorter: the end of it.
    expect(cardStepTarget(rows, columns, card("f"), "right")).toEqual({ columnId: "z", index: 1 });
    expect(cardStepTarget(rows, columns, card("g"), "right")).toBeNull();
    // A card of a column not on the board (archived) has nowhere to go.
    expect(cardStepTarget(rows, ["y"], card("a"), "right")).toBeNull();
  });

  it("is due soon within 24 hours of its due time and overdue from it on", () => {
    const card = { due_date: "2026-11-10", due_time: "09:30" };
    const at = (iso: string) => dueState(card, "Europe/Berlin", Date.parse(iso));
    // 09:30 in Berlin is 08:30 UTC in November.
    expect(at("2026-11-09T08:29:00Z")).toBeNull();
    expect(at("2026-11-09T08:30:00Z")).toBe("soon");
    expect(at("2026-11-10T08:29:00Z")).toBe("soon");
    expect(at("2026-11-10T08:30:00Z")).toBe("overdue");
    expect(dueState({ due_date: null }, "UTC", 0)).toBeNull();
  });

  it("takes a date alone as the whole day: due soon on it, overdue from the next one", () => {
    // 29 March 2026: Berlin moves to summer time, the day is 23 hours long.
    const card = { due_date: "2026-03-29", due_time: null };
    const at = (iso: string) => dueState(card, "Europe/Berlin", Date.parse(iso));
    expect(at("2026-03-28T22:59:00Z")).toBeNull();
    expect(at("2026-03-28T23:00:00Z")).toBe("soon");
    expect(at("2026-03-29T21:59:00Z")).toBe("soon");
    expect(at("2026-03-29T22:00:00Z")).toBe("overdue");
  });
});
