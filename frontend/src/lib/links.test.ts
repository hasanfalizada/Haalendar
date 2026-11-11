// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Links on the device (D-98): both sides of a link, the trash and closed
// ends, what can still be linked, and where an item opens.
import { describe, expect, it } from "vitest";

import { itemTarget, linkCandidates, linkedItems } from "./links";

const items = [
  { id: "c", kind: "card", title: "Plan", container_id: "b1" },
  { id: "n", kind: "note", title: "Shopping", body: "milk and bread" },
  { id: "e", kind: "event", title: "Dentist", start_date: "2026-11-10" },
  { id: "x", kind: "note", title: "Old", deleted_at: "2026-10-01T00:00:00Z" },
  { id: "z", kind: "event", title: "Zoo", start_date: "2026-11-12" },
];
const links = [
  { id: "l1", from_item_id: "c", to_item_id: "n" },
  { id: "l2", from_item_id: "x", to_item_id: "c" },
  { id: "l3", from_item_id: "c", to_item_id: "gone" },
  { id: "l4", from_item_id: "c", to_item_id: "z", deleted_at: "2026-10-02T00:00:00Z" },
];

describe("links", () => {
  it("lists both sides of an item's live links: open by title, then the trash, then closed", () => {
    expect(linkedItems(links, items, "c").map((entry) => [entry.itemId, entry.state])).toEqual([
      ["n", "open"],
      ["x", "trash"],
      ["gone", "closed"],
    ]);
    // The backlink: the same link from the note's side.
    expect(linkedItems(links, items, "n").map((entry) => [entry.linkId, entry.itemId])).toEqual([["l1", "c"]]);
  });

  it("offers live events, notes and cards not linked yet, found by title or text", () => {
    expect(linkCandidates(items, links, "c", "").map((row) => row.id)).toEqual(["e", "z"]);
    expect(linkCandidates(items, links, "c", "DENT").map((row) => row.id)).toEqual(["e"]);
    expect(linkCandidates(items, links, "e", "bread").map((row) => row.id)).toEqual(["n"]);
  });

  it("opens an event on its day, a note on the To-Do page and a card on its board", () => {
    expect(itemTarget(items[2] as Record<string, unknown>)).toEqual({
      to: "/calendar",
      search: { date: "2026-11-10", view: "day", event: "e" },
    });
    expect(itemTarget(items[1] as Record<string, unknown>)).toEqual({ to: "/todo", search: { note: "n" } });
    expect(itemTarget(items[0] as Record<string, unknown>)).toEqual({
      to: "/kanban/$boardId",
      params: { boardId: "b1" },
      search: { card: "c" },
    });
  });
});
