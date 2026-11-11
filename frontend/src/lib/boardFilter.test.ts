// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. The board filters (D-96): any of the chosen within a kind, all kinds
// together; due kinds in the reader's zone with the user's first weekday; text in title, description and checklist;
// the address form drops what it does not know.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. Assignees: "me" or members, a non-member's assignment does not count.
import { describe, expect, it } from "vitest";

import {
  type BoardFilter,
  NO_FILTER,
  cardMatches,
  filterCount,
  formatBoardFilter,
  parseBoardFilter,
} from "./boardFilter";

const L1 = "0199f000-0000-7000-8000-0000000000f1";
const L2 = "0199f000-0000-7000-8000-0000000000f2";
const ME = "0199f000-0000-7000-8000-0000000000a1";
const BOB = "0199f000-0000-7000-8000-0000000000a2";
const GONE = "0199f000-0000-7000-8000-0000000000a3";
// Friday, 30 October 2026, noon in Berlin.
const NOW = Date.parse("2026-10-30T11:00:00Z");
const context = {
  itemLabels: [
    { item_id: "a", label_id: L1, deleted_at: null },
    { item_id: "b", label_id: L2, deleted_at: null },
    { item_id: "c", label_id: L1, deleted_at: "2026-10-01T00:00:00Z" },
  ],
  checklistItems: [{ item_id: "c", text: "Write release notes", deleted_at: null }],
  assignees: [
    { item_id: "a", user_id: ME, deleted_at: null },
    { item_id: "b", user_id: BOB, deleted_at: null },
    { item_id: "c", user_id: ME, deleted_at: "2026-10-01T00:00:00Z" },
    { item_id: "d", user_id: GONE, deleted_at: null },
  ],
  members: new Set([ME, BOB]) as ReadonlySet<string> | null,
  me: ME,
  timeZone: "Europe/Berlin",
  now: NOW,
  weekStart: 1,
};
const cards = [
  { id: "a", title: "Plan", body: "", priority: "high", due_date: "2026-10-29", due_time: null },
  { id: "b", title: "Ship", body: "Deploy the build", priority: "medium", due_date: "2026-10-30", due_time: null },
  { id: "c", title: "Notes", body: "", priority: "low", due_date: "2026-11-01", due_time: null },
  { id: "d", title: "Later", body: "", priority: "medium", due_date: "2026-11-02", due_time: null },
  { id: "e", title: "Someday", body: "", priority: "low", due_date: null, due_time: null },
];
const shown = (filter: Partial<BoardFilter>) =>
  cards.filter((card) => cardMatches(card, { ...NO_FILTER, ...filter }, context)).map((card) => card.id);

describe("board filters", () => {
  it("shows everything without a filter and counts the kinds chosen", () => {
    expect(shown({})).toEqual(["a", "b", "c", "d", "e"]);
    expect(filterCount({ ...NO_FILTER, labels: [L1, L2], text: " x " })).toBe(2);
    expect(filterCount({ ...NO_FILTER, text: "  " })).toBe(0);
  });

  it("takes any of the chosen labels, priorities and due kinds", () => {
    expect(shown({ labels: [L1] })).toEqual(["a"]); // the label taken off "c" does not count
    expect(shown({ labels: [L1, L2] })).toEqual(["a", "b"]);
    expect(shown({ priorities: ["low", "high"] })).toEqual(["a", "c", "e"]);
    expect(shown({ due: ["overdue"] })).toEqual(["a"]);
    expect(shown({ due: ["today"] })).toEqual(["b"]);
    // The week from Monday 26 October to Sunday 1 November.
    expect(shown({ due: ["week"] })).toEqual(["a", "b", "c"]);
    expect(shown({ due: ["none", "today"] })).toEqual(["b", "e"]);
  });

  it("finds the text in the title, description or checklist, case ignored, and needs every kind to match", () => {
    expect(shown({ text: "DEPLOY" })).toEqual(["b"]);
    expect(shown({ text: "release notes" })).toEqual(["c"]);
    expect(shown({ text: "  plan " })).toEqual(["a"]);
    expect(shown({ priorities: ["low"], due: ["week"] })).toEqual(["c"]);
    expect(shown({ labels: [L2], priorities: ["high"] })).toEqual([]);
  });

  it('takes any of the chosen assignees — the user as "me" — among the members only', () => {
    expect(shown({ assignees: ["me"] })).toEqual(["a"]);
    expect(shown({ assignees: ["me", BOB] })).toEqual(["a", "b"]);
    expect(shown({ assignees: [GONE] })).toEqual([]); // no longer a member
    const unknown = cards.filter((card) =>
      cardMatches(card, { ...NO_FILTER, assignees: [GONE] }, { ...context, members: null }),
    );
    expect(unknown.map((card) => card.id)).toEqual(["d"]); // members not known yet: every row counts
  });

  it("starts the week on the user's first weekday", () => {
    const sunday = cards.filter((card) =>
      cardMatches(card, { ...NO_FILTER, due: ["week"] }, { ...context, weekStart: 0 }),
    );
    // From Sunday 25 October to Saturday 31 October.
    expect(sunday.map((card) => card.id)).toEqual(["a", "b"]);
  });

  it("goes into the address and back, dropping what it does not know", () => {
    const filter: BoardFilter = {
      labels: [L2, L1],
      assignees: [BOB, "me"],
      priorities: ["low", "high"],
      due: ["none", "overdue"],
      text: "x",
    };
    const search = formatBoardFilter(filter);
    expect(search).toEqual({
      labels: `${L1},${L2}`,
      assignee: `me,${BOB}`,
      priority: "high,low",
      due: "overdue,none",
      q: "x",
    });
    expect(parseBoardFilter(search)).toEqual({
      ...filter,
      labels: [L1, L2],
      assignees: ["me", BOB],
      priorities: ["high", "low"],
      due: ["overdue", "none"],
    });
    expect(parseBoardFilter({ labels: "nope", assignee: "you", priority: "urgent", due: "soon" })).toEqual(NO_FILTER);
    expect(formatBoardFilter(NO_FILTER)).toEqual({
      labels: undefined,
      assignee: undefined,
      priority: undefined,
      due: undefined,
      q: undefined,
    });
  });
});
