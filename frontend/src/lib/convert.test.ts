// +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (D-125, stage 2). What the "Convert to…" dialog tells before
// the server converts: the kinds an item can become, why it cannot be converted, and what changes or is taken off — the
// rules of the server (planning/convert.py).
import { describe, expect, it } from "vitest";

import { type ChangeRows, changesOf, convertedTo, refusalOf, targetsOf } from "./convert";

const ME = "u1";
const BOARD = "b1";
const none: ChangeRows = { checklist: [], itemLabels: [], labels: [], assignees: [], comments: [], reminders: [] };

const item = (kind: string, extra: Record<string, unknown> = {}) => ({ id: "i1", kind, owner_id: ME, ...extra });

describe("convert", () => {
  it("offers the other kinds; a note only for the owner's own item", () => {
    expect(targetsOf(item("event"), ME)).toEqual(["note", "card"]);
    expect(targetsOf(item("note"), ME)).toEqual(["event", "card"]);
    expect(targetsOf(item("card", { owner_id: "u2" }), ME)).toEqual(["event"]);
  });

  it("refuses a repeating event and someone else's note", () => {
    expect(refusalOf(item("event", { rrule: "FREQ=DAILY" }), ME)).toBe("repeating");
    expect(refusalOf(item("event", { rrule: null }), ME)).toBeNull();
    expect(refusalOf(item("note", { owner_id: "u2" }), ME)).toBe("notOwner");
    expect(refusalOf(item("card", { owner_id: "u2" }), ME)).toBeNull();
  });

  it("tells what changes: checklist, place, a long title", () => {
    const rows = {
      ...none,
      checklist: [
        { item_id: "i1", text: "a" },
        { item_id: "i1", text: "b", deleted_at: "2026-11-01T00:00:00Z" },
        { item_id: "i2", text: "c" },
      ],
    };
    expect(changesOf(item("note"), "event", ME, rows)).toEqual([{ key: "checklist", values: { count: 1 } }]);
    expect(changesOf(item("note"), "card", ME, rows, BOARD)).toEqual([]);
    expect(changesOf(item("event", { location: " Main St " }), "note", ME, none)).toEqual([
      { key: "location", values: { place: "Main St" } },
    ]);
    expect(changesOf(item("card", { title: "x".repeat(151) }), "event", ME, none)).toEqual([
      { key: "titleCut", values: { count: 150 } },
    ]);
  });

  it("takes off the labels without one of the same name there, every label into an event", () => {
    const rows = {
      ...none,
      labels: [
        { id: "p1", name: "Home", board_id: null, container_id: ME },
        { id: "p2", name: "urgent", board_id: null, container_id: ME },
        { id: "b1", name: "Urgent", board_id: BOARD, container_id: BOARD },
      ],
      itemLabels: [
        { item_id: "i1", label_id: "p1" },
        { item_id: "i1", label_id: "p2" },
      ],
    };
    expect(changesOf(item("note"), "card", ME, rows, BOARD)).toEqual([
      { key: "labels", values: { names: "Home", count: 1 } },
    ]);
    expect(changesOf(item("note"), "event", ME, rows)).toEqual([
      { key: "labels", values: { names: "Home, urgent", count: 2 } },
    ]);
  });

  it("takes off a card's assignees and comments, and the user's reminders of the other form", () => {
    const rows = {
      ...none,
      assignees: [{ item_id: "i1" }],
      comments: [{ item_id: "i1" }, { item_id: "i1" }],
      reminders: [
        { item_id: "i1", owner_id: ME, offset_minutes: 30 },
        { item_id: "i1", owner_id: "u2", offset_minutes: 10 },
        { item_id: "i1", owner_id: ME, remind_at: "2026-12-01T09:00:00Z" },
      ],
    };
    expect(changesOf(item("card"), "note", ME, rows)).toEqual([
      { key: "assignees", values: { count: 1 } },
      { key: "comments", values: { count: 2 } },
      { key: "reminders", values: { count: 1 } },
    ]);
    // An event's reminders count from its start as a card's do.
    expect(changesOf(item("event"), "card", ME, rows, BOARD)).toEqual([]);
    expect(changesOf(item("note"), "event", ME, rows)).toEqual([{ key: "reminders", values: { count: 1 } }]);
  });

  it("reads the kind an audit record made", () => {
    expect(convertedTo({ kind: "card" })).toBe("card");
    expect(convertedTo({ kind: "other" })).toBeNull();
    expect(convertedTo(null)).toBeNull();
  });
});
