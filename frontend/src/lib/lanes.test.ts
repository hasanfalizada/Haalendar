// +++===+++ 2026-11-27 — Hasan Alizada — HAAL-115 (D-130). Swimlanes without React: the lanes of each kind, which cards
// are in a lane, what a move to another lane writes and what a card added in a lane gets.
import { describe, expect, it } from "vitest";

import { type LaneContext, canChangeLane, inLane, laneChange, laneRows, laneStart, lanesOf, parseLanes } from "./lanes";

const ADA = "0199f000-0000-7000-8000-0000000000a1";
const BOB = "0199f000-0000-7000-8000-0000000000a2";
const GONE = "0199f000-0000-7000-8000-0000000000a3";
const URGENT = "0199f000-0000-7000-8000-0000000000f1";

const context: LaneContext = {
  labels: [{ id: URGENT, name: "Urgent", color: "red" }],
  itemLabels: [
    { id: "il1", item_id: "plan", label_id: URGENT, deleted_at: null },
    { id: "il2", item_id: "ship", label_id: URGENT, deleted_at: "2026-11-01T00:00:00Z" },
  ],
  members: [
    { user_id: ADA, display_name: "Ada" },
    { user_id: BOB, display_name: "Bob" },
  ],
  assignees: [
    { id: "as1", item_id: "plan", user_id: ADA, deleted_at: null },
    { id: "as2", item_id: "plan", user_id: BOB, deleted_at: null },
    { id: "as3", item_id: "ship", user_id: GONE, deleted_at: null },
  ],
};

const plan = { id: "plan", kind: "card", priority: "high" };
const ship = { id: "ship", kind: "card", priority: null };

const lane = (kind: "priority" | "assignee" | "label", key: string) => {
  const found = lanesOf(kind, context).find((l) => l.key === key);
  if (!found) throw new Error(`no lane ${key}`);
  return found;
};

describe("swimlanes", () => {
  it("reads the kind from the address, unknown values dropped", () => {
    expect(parseLanes("assignee")).toBe("assignee");
    expect(parseLanes("column")).toBeNull();
    expect(parseLanes(undefined)).toBeNull();
  });

  it("has the priorities high to low, the members then Unassigned, the labels then No label", () => {
    expect(lanesOf("priority", context).map((l) => l.key)).toEqual(["high", "medium", "low"]);
    expect(lanesOf("assignee", context).map((l) => [l.key, l.name])).toEqual([
      [ADA, "Ada"],
      [BOB, "Bob"],
      ["none", ""],
    ]);
    expect(lanesOf("label", context).map((l) => [l.key, l.color])).toEqual([
      [URGENT, "red"],
      ["none", undefined],
    ]);
  });

  it("puts a card in each lane of its values; no priority is medium; only members and live rows count", () => {
    expect(inLane(plan, lane("priority", "high"), context)).toBe(true);
    expect(inLane(ship, lane("priority", "medium"), context)).toBe(true);
    expect(inLane(plan, lane("assignee", ADA), context)).toBe(true);
    expect(inLane(plan, lane("assignee", BOB), context)).toBe(true);
    // Assigned to someone no longer a member: unassigned, as the card shows it.
    expect(inLane(ship, lane("assignee", "none"), context)).toBe(true);
    // Its label was taken off.
    expect(inLane(ship, lane("label", "none"), context)).toBe(true);
    expect(inLane(plan, lane("label", "none"), context)).toBe(false);
    const note = { id: "n", kind: "note" };
    expect(laneRows([plan, ship, note], lane("priority", "high"), context)).toEqual([plan, note]);
  });

  it("writes the lane's priority, or moves the assignee; between labels nothing", () => {
    expect(laneChange(plan, lane("priority", "high"), lane("priority", "low"), context)).toEqual({
      data: { priority: "low" },
      assignees: { add: [], remove: [] },
    });
    // From Ada's lane to Bob's: Bob is on it already — only Ada comes off.
    expect(laneChange(plan, lane("assignee", ADA), lane("assignee", BOB), context)?.assignees).toEqual({
      add: [],
      remove: ["as1"],
    });
    // To Unassigned: every member off (the former member's row stays).
    expect(laneChange(plan, lane("assignee", ADA), lane("assignee", "none"), context)?.assignees.remove).toEqual([
      "as1",
      "as2",
    ]);
    const added = laneChange(ship, lane("assignee", "none"), lane("assignee", ADA), context)?.assignees;
    expect(added?.remove).toEqual([]);
    expect(added?.add.map((a) => a.user_id)).toEqual([ADA]);
    expect(laneChange(plan, lane("label", URGENT), lane("label", "none"), context)).toBeNull();
    expect(canChangeLane(lane("label", URGENT), lane("label", URGENT))).toBe(true);
    expect(laneChange(plan, lane("priority", "high"), lane("priority", "high"), context)?.data).toEqual({});
  });

  it("gives a card added in a lane the lane's value", () => {
    expect(laneStart(lane("priority", "low"))).toEqual({ priority: "low" });
    expect(laneStart(lane("assignee", BOB))).toEqual({ assignee: BOB });
    expect(laneStart(lane("label", URGENT))).toEqual({ label: URGENT });
    expect(laneStart(lane("label", "none"))).toEqual({});
  });
});
