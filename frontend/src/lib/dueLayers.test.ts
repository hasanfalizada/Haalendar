// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-121. The layers of due dates (D-122): which notes and cards, on
// which day, in which order, and a hidden layer.
import { describe, expect, it } from "vitest";

import { duesOnDays } from "./dueLayers";

const boards = [
  { id: "b1", name: "Home" },
  { id: "b2", name: "Old", archived_at: "2026-10-01T00:00:00Z" },
  { id: "b3", name: "Gone", deleted_at: "2026-10-01T00:00:00Z" },
];
const items = [
  { id: "n1", kind: "note", title: "Taxes", due_date: "2026-12-01", due_time: "18:00" },
  { id: "n2", kind: "note", title: "Call", due_date: "2026-12-01" },
  { id: "n3", kind: "note", title: "Archived", due_date: "2026-12-01", archived_at: "2026-11-01T00:00:00Z" },
  { id: "n4", kind: "note", title: "Deleted", due_date: "2026-12-01", deleted_at: "2026-11-01T00:00:00Z" },
  { id: "n5", kind: "note", title: "No due date" },
  { id: "c1", kind: "card", title: "Paint", container_id: "b1", due_date: "2026-12-01", due_time: "09:30" },
  { id: "c2", kind: "card", title: "On an archived board", container_id: "b2", due_date: "2026-12-01" },
  { id: "c3", kind: "card", title: "On a deleted board", container_id: "b3", due_date: "2026-12-01" },
  { id: "c4", kind: "card", title: "Later", container_id: "b1", due_date: "2026-12-02" },
  { id: "e1", kind: "event", title: "An event", due_date: "2026-12-01", start_date: "2026-12-01" },
];
const days = ["2026-12-01", "2026-12-02"];

describe("layers of due dates", () => {
  it("live notes and cards on live boards, on their dates: the whole day first, then by time", () => {
    const byDay = duesOnDays(items, boards, days, new Set());
    expect(byDay.get("2026-12-01")?.map((entry) => [entry.id, entry.kind, entry.time])).toEqual([
      ["n2", "note", null],
      ["c1", "card", "09:30"],
      ["n1", "note", "18:00"],
    ]);
    expect(byDay.get("2026-12-02")?.map((entry) => entry.id)).toEqual(["c4"]);
  });

  it("a hidden layer gives nothing", () => {
    expect(
      duesOnDays(items, boards, days, new Set(["note_due"]))
        .get("2026-12-01")
        ?.map((e) => e.id),
    ).toEqual(["c1"]);
    expect(duesOnDays(items, boards, days, new Set(["card_due"])).get("2026-12-02")).toEqual([]);
    const none = duesOnDays(items, boards, days, new Set(["note_due", "card_due"]));
    expect([...none.values()].flat()).toEqual([]);
  });
});
