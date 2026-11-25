// +++===+++ 2026-11-25 09:48 +04 — Hasan Alizada — HAAL-114 (D-123). Audit records of an item in words: the item, its
// details, checklist, labels, assignees, images, links, comments and single dates; names from the rows on the device,
// "a …" when it does not know them; repeats, bookkeeping and pure reorders left out.
import { describe, expect, it } from "vitest";

import type { AuditRecord } from "@/api/generated/types.gen";

import { type ActivityNames, activityLine } from "./activity";

const CARD = "card-1";
const record = (over: Partial<AuditRecord>): AuditRecord => ({
  id: "r",
  occurred_at: "2026-11-20T10:00:00Z",
  actor_id: "u1",
  actor_name: "Ada",
  action: "update",
  entity_type: "item",
  entity_id: CARD,
  before: null,
  after: null,
  ...over,
});

const names: ActivityNames = {
  columns: new Map([["col-2", "Done"]]),
  labels: new Map([["lab-1", "Urgent"]]),
  users: new Map([["u2", "Bob"]]),
  items: new Map([
    [CARD, "Plan"],
    ["note-1", "Shopping"],
  ]),
  rows: new Map<string, Record<string, unknown>>([
    ["ch-1", { id: "ch-1", text: "Buy milk" }],
    ["il-1", { id: "il-1", label_id: "lab-1" }],
    ["as-1", { id: "as-1", user_id: "u2" }],
    ["ln-1", { id: "ln-1", from_item_id: "note-1", to_item_id: CARD }],
    ["at-1", { id: "at-1", file_name: "plan.png" }],
  ]),
};

const line = (over: Partial<AuditRecord>, kind: "card" | "event" | "note" = "card") =>
  activityLine(record(over), { id: CARD, kind }, names);

describe("activityLine", () => {
  it("names what happened to the item", () => {
    expect(line({ action: "create", after: { title: "Plan" } })).toEqual({ key: "created.card", values: {} });
    expect(line({ action: "create", entity_type: "card" })).toBeNull();
    expect(line({ action: "delete" }, "note")).toEqual({ key: "deleted.note", values: {} });
    expect(line({ action: "restore" }, "event")).toEqual({ key: "restored.event", values: {} });
    expect(
      line({
        entity_type: "card",
        before: { due_date: null, version: 1 },
        after: { due_date: "2026-12-01", version: 2 },
      }),
    ).toEqual({ key: "changed", values: {}, fields: ["due_date"] });
    expect(line({ after: { legacy_thing: 1 } })).toEqual({ key: "changed", values: {}, fields: ["other"] });
    expect(line({ after: { updated_at: "x" } })).toBeNull();
  });

  it("names moves: the column, another container, or only the order", () => {
    expect(line({ action: "move", entity_type: "card", after: { column_id: "col-2", position: "M" } })).toEqual({
      key: "movedTo",
      values: { column: "Done" },
    });
    expect(line({ action: "move", entity_type: "card", after: { column_id: "col-9" } })).toEqual({
      key: "moved",
      values: {},
    });
    expect(line({ action: "move", after: { container_id: "cal-2" } }, "event")).toEqual({
      key: "movedContainer.event",
      values: {},
    });
    expect(line({ action: "move", entity_type: "card", after: { position: "M" } })).toEqual({
      key: "moved",
      values: {},
    });
    expect(line({ action: "move", entity_type: "note", after: { position: "M" } }, "note")).toBeNull();
  });

  it("names the checklist, labels, assignees, images and links from the device's rows", () => {
    expect(
      line({ action: "create", entity_type: "checklist_item", entity_id: "ch-9", after: { text: "Call" } }),
    ).toEqual({ key: "checklistAdded", values: { text: "Call" } });
    expect(line({ entity_type: "checklist_item", entity_id: "ch-1", after: { checked: true } })).toEqual({
      key: "checklistChecked",
      values: { text: "Buy milk" },
    });
    expect(line({ action: "delete", entity_type: "checklist_item", entity_id: "ch-x" })).toEqual({
      key: "checklistRemovedUnnamed",
      values: { text: "" },
    });
    expect(line({ action: "move", entity_type: "checklist_item", entity_id: "ch-1" })).toBeNull();
    expect(line({ action: "delete", entity_type: "item_label", entity_id: "il-1" })).toEqual({
      key: "labelRemoved",
      values: { name: "Urgent" },
    });
    expect(line({ action: "restore", entity_type: "card_assignee", entity_id: "as-1" })).toEqual({
      key: "assigned",
      values: { name: "Bob" },
    });
    expect(line({ action: "delete", entity_type: "attachment", entity_id: "at-1" })).toEqual({
      key: "imageRemoved",
      values: { name: "plan.png" },
    });
    // The other end of the link, whichever side the card is on.
    expect(line({ action: "create", entity_type: "link", entity_id: "ln-1" })).toEqual({
      key: "linked",
      values: { title: "Shopping" },
    });
    expect(line({ action: "delete", entity_type: "link", entity_id: "ln-9" })).toEqual({
      key: "unlinkedUnnamed",
      values: { title: "" },
    });
  });

  it("leaves a comment's own records out but names its delete and restore; names single dates", () => {
    expect(line({ action: "create", entity_type: "comment" })).toBeNull();
    expect(line({ action: "update", entity_type: "comment" })).toBeNull();
    expect(line({ action: "delete", entity_type: "comment" })).toEqual({ key: "commentDeleted", values: {} });
    expect(line({ action: "restore", entity_type: "comment" })).toEqual({ key: "commentRestored", values: {} });
    const date = { occurrence_date: "2026-12-24" };
    expect(
      line({ action: "create", entity_type: "recurrence_exception", after: { ...date, kind: "cancelled" } }, "event"),
    ).toEqual({ key: "dateRemoved", values: { date: "2026-12-24" } });
    expect(
      line({ action: "create", entity_type: "recurrence_exception", after: { ...date, kind: "overridden" } }, "event"),
    ).toEqual({ key: "dateChanged", values: { date: "2026-12-24" } });
    expect(line({ action: "delete", entity_type: "recurrence_exception" }, "event")).toEqual({
      key: "dateBackUnnamed",
      values: { date: "" },
    });
  });
});
