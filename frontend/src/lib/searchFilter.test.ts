// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-046 (D-120). The search filters: each kind, together, what
// leaves a module out, dates of one-off and repeating events and due dates, presets, and a search by filters alone.
import { describe, expect, it } from "vitest";

import { searchItems, type SearchInput } from "./search";
import { compileFilter, type FilterContext, NO_FILTER, presetRange, type SearchFilter } from "./searchFilter";

const TODAY = "2026-11-24"; // a Tuesday
const context: FilterContext = {
  labels: [
    { id: "L1", name: "Trips" },
    { id: "L2", name: "trips", board_id: "b1" }, // a board label of the same name
    { id: "L3", name: "Work", deleted_at: "2026-11-01T00:00:00Z" },
  ],
  itemLabels: [
    { item_id: "n1", label_id: "L1" },
    { item_id: "k1", label_id: "L2" },
    { item_id: "n2", label_id: "L3" },
  ],
  viewerTz: "Europe/Berlin",
  today: TODAY,
};

const items = [
  {
    id: "e1",
    kind: "event",
    title: "Plan trip",
    container_id: "home",
    start_date: "2026-11-25",
    color: "red",
    priority: "high",
  },
  {
    id: "e2",
    kind: "event",
    title: "Plan budget",
    container_id: "work",
    start_date: "2026-12-10",
    end_date: "2026-12-12",
  },
  {
    id: "e3",
    kind: "event",
    title: "Plan yoga",
    container_id: "home",
    start_date: "2026-10-05",
    rrule: "FREQ=WEEKLY",
    color: "green",
  },
  { id: "n1", kind: "note", title: "Plan packing", color: "red", due_at: "2026-11-24T23:30:00Z" },
  { id: "n2", kind: "note", title: "Plan review", priority: "low" },
  { id: "k1", kind: "card", title: "Plan the route", container_id: "b1", due_date: "2026-11-26", priority: "high" },
];
const input: SearchInput = { items, checklistItems: [], boards: [], calendarShown: () => true };

function found(filter: Partial<SearchFilter>, query = "plan") {
  const results = searchItems(input, query, 20, compileFilter({ ...NO_FILTER, ...filter }, context));
  return [...results.calendar, ...results.todo, ...results.kanban].map((hit) => hit.row.id);
}

describe("search filters", () => {
  it("without a filter everything matching the words is found", () => {
    expect(found({})).toEqual(["e2", "e1", "e3", "n1", "n2", "k1"]);
  });

  it("module, colour (brown by default) and priority (medium by default)", () => {
    expect(found({ modules: ["todo", "kanban"] })).toEqual(["n1", "n2", "k1"]);
    expect(found({ colors: ["red"] })).toEqual(["e1", "n1"]);
    expect(found({ colors: ["brown"] })).toEqual(["e2", "n2", "k1"]);
    expect(found({ priorities: ["high"] })).toEqual(["e1", "k1"]);
    expect(found({ priorities: ["medium"] })).toEqual(["e2", "e3", "n1"]);
  });

  it("a calendar keeps events only, a label notes and cards only, by name across boards", () => {
    expect(found({ calendars: ["home"] })).toEqual(["e1", "e3"]);
    expect(found({ labels: ["trips"] })).toEqual(["n1", "k1"]);
    expect(found({ labels: ["work"] })).toEqual([]); // a deleted label
    expect(found({ calendars: ["home"], labels: ["trips"] })).toEqual([]);
  });

  it("dates: a day of an event, an occurrence of a series, a due date in the viewer's zone", () => {
    expect(found({ from: "2026-12-11", to: "2026-12-31" })).toEqual(["e2", "e3"]); // e2 runs 10–12 Dec
    expect(found({ from: "2026-11-27", to: "2026-11-29" })).toEqual([]); // Fri–Sun: no Monday of the series
    expect(found({ from: "2026-11-25", to: "2026-11-25" })).toEqual(["e1", "n1"]); // 23:30 UTC is 00:30 on the 25th in Berlin
    expect(found({ from: "2026-11-26" })).toEqual(["k1"]); // one end alone is that day
    expect(found({ from: "2027-12-01", to: "2029-01-31" })).toEqual(["e3"]); // a long range, asked a year at a time
  });

  it("filters alone find without words, by day", () => {
    expect(found({ colors: ["red"] }, "")).toEqual(["e1", "n1"]);
    expect(found({ priorities: ["high"] }, "  ")).toEqual(["e1", "k1"]);
    expect(found({}, "")).toEqual([]);
    const byDay = searchItems(input, "", 20, compileFilter({ ...NO_FILTER, modules: ["calendar"] }, context));
    expect(byDay.calendar.map((hit) => hit.row.id)).toEqual(["e1", "e3", "e2"]); // 25 Nov, next Monday 30 Nov, 10 Dec
  });

  it("presets around today, the week from the user's first weekday", () => {
    expect(presetRange("today", TODAY, 1)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange("week", TODAY, 1)).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(presetRange("week", TODAY, 0)).toEqual({ from: "2026-11-22", to: "2026-11-28" });
    expect(presetRange("month", TODAY, 1)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(presetRange("month", "2026-12-31", 1)).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(presetRange("next30", TODAY, 1)).toEqual({ from: TODAY, to: "2026-12-23" });
  });
});
