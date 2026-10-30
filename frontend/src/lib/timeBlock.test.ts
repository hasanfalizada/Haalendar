// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. Time blocking (D-99): what the panel offers and in which order, the
// time-blocked mark, the event a drop makes (an hour, across midnight, all day) and where Schedule… starts.
import { describe, expect, it } from "vitest";

import { blockForm, isTimeBlocked, schedulable, suggestedStart } from "./timeBlock";

const boards = [
  { id: "b1", name: "Revamp" },
  { id: "b2", name: "Old", archived_at: "2026-10-01T00:00:00Z" },
];
const items = [
  { id: "n1", kind: "note", title: "Shopping", body: "milk" },
  { id: "n2", kind: "note", title: "Archived", archived_at: "2026-10-01T00:00:00Z" },
  { id: "n3", kind: "note", title: "Due later", due_at: "2026-11-12T00:00:00Z" },
  { id: "n4", kind: "note", title: "Due soon", due_at: "2026-11-01T00:00:00Z" },
  { id: "c1", kind: "card", title: "Plan", container_id: "b1", due_date: "2026-11-05" },
  { id: "c2", kind: "card", title: "Gone", container_id: "b1", deleted_at: "2026-10-01T00:00:00Z" },
  { id: "c3", kind: "card", title: "On an archived board", container_id: "b2" },
  { id: "e1", kind: "event", title: "Dentist" },
];

describe("time blocking", () => {
  it("offers live notes and cards, the due ones first, found by title or text", () => {
    expect(schedulable(items, boards, "note", "").map((entry) => entry.row.id)).toEqual(["n4", "n3", "n1"]);
    expect(schedulable(items, boards, "note", "MILK").map((entry) => entry.row.id)).toEqual(["n1"]);
    const [card] = schedulable(items, boards, "card", "");
    expect([card?.row.id, card?.boardName, card?.due]).toEqual(["c1", "Revamp", "2026-11-05"]);
    expect(schedulable(items, boards, "card", "")).toHaveLength(1);
  });

  it("knows an item scheduled already by a live time-block link", () => {
    const links = [
      { from_item_id: "e1", to_item_id: "n1", origin: "time_block" },
      { from_item_id: "e1", to_item_id: "c1", origin: "manual" },
      { from_item_id: "e1", to_item_id: "n3", origin: "time_block", deleted_at: "2026-10-01T00:00:00Z" },
    ];
    expect(["n1", "c1", "n3"].map((id) => isTimeBlocked(links, id))).toEqual([true, false, false]);
  });

  it("makes an hour from the drop (across midnight onto the next day) or a whole day", () => {
    expect(blockForm("Plan", "2026-11-10", 600, "blue", "cal")).toMatchObject({
      title: "Plan",
      all_day: "false",
      start_date: "2026-11-10",
      start_time: "10:00",
      end_date: "2026-11-10",
      end_time: "11:00",
      calendar_id: "cal",
      color: "blue",
    });
    expect(blockForm("Late", "2026-11-10", 23 * 60 + 30, "blue", "cal")).toMatchObject({
      start_time: "23:30",
      end_date: "2026-11-11",
      end_time: "00:30",
    });
    expect(blockForm("All day", "2026-11-10", undefined, "blue", "cal")).toMatchObject({ all_day: "true" });
  });

  it("starts Schedule… at the next quarter hour today, else at 09:00", () => {
    expect(suggestedStart("2026-11-10", "2026-11-10", 10 * 60 + 7)).toBe(10 * 60 + 15);
    expect(suggestedStart("2026-11-10", "2026-11-10", 10 * 60)).toBe(10 * 60 + 15);
    expect(suggestedStart("2026-11-11", "2026-11-10", 10 * 60)).toBe(9 * 60);
    expect(suggestedStart("2026-11-10", "2026-11-10", 23 * 60 + 55)).toBe(23 * 60 + 45);
  });
});
