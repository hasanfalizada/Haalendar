// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. What the copy of an event is (FR-CAL-34, D-84): a one-off event keeps
// its length and times on the new start date, an occurrence of a series becomes a one-off event, the source is named.
import { describe, expect, it } from "vitest";

import { defaultTarget, duplicateData } from "./duplicate";

const base = {
  id: "e1",
  kind: "event",
  container_id: "c1",
  tzid: "America/New_York",
  version: 3,
  title: "Trip",
  body: "Pack the **bag**",
  color: "purple",
  priority: "high",
  location: "Airport",
};

describe("duplicate", () => {
  it("copies a timed multi-day event to another month keeping its length and times", () => {
    const row = {
      ...base,
      all_day: false,
      start_date: "2026-10-30",
      start_time: "22:00",
      end_date: "2026-11-01",
      end_time: "06:30",
      rrule: null,
    };
    expect(defaultTarget(row, "2026-10-31")).toBe("2026-10-31");
    expect(duplicateData(row, "2026-10-31", "2027-02-27")).toEqual({
      kind: "event",
      container_kind: "calendar",
      container_id: "c1",
      tzid: "America/New_York",
      title: "Trip",
      body: "Pack the **bag**",
      color: "purple",
      priority: "high",
      location: "Airport",
      all_day: false,
      start_date: "2027-02-27",
      start_time: "22:00",
      end_date: "2027-03-01",
      end_time: "06:30",
      rrule: null,
      copy_attachments_from: "e1",
    });
  });

  it("copies an all-day event to an earlier date", () => {
    const row = { ...base, all_day: true, start_date: "2026-12-24", end_date: "2026-12-26", rrule: null };
    expect(duplicateData(row, "2026-12-25", "2026-12-01")).toMatchObject({
      all_day: true,
      start_date: "2026-12-01",
      end_date: "2026-12-03",
      start_time: null,
      end_time: null,
    });
  });

  it("copies an occurrence of a series as a one-off event without the rule", () => {
    const row = {
      ...base,
      title: "(No title)",
      all_day: false,
      start_date: "2026-11-02",
      start_time: "10:00",
      end_date: "2026-11-02",
      end_time: "10:15",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
      exceptions: ["2026-11-04"],
    };
    expect(defaultTarget(row, "2026-11-09")).toBe("2026-11-10");
    expect(duplicateData(row, "2026-11-09", "2026-11-14")).toMatchObject({
      title: "",
      start_date: "2026-11-14",
      end_date: "2026-11-14",
      start_time: "10:00",
      end_time: "10:15",
      rrule: null,
      copy_attachments_from: "e1",
    });
  });
});
