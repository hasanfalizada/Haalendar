// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. Month view parts (FR-CAL-26, D-76): only the weeks of the month from
// the user's week start, what fits into a cell and "+N more", the title.
import { describe, expect, it } from "vitest";

import { fitInCell, monthTitle, monthWeeks } from "./monthView";

describe("monthWeeks", () => {
  it("covers the month with whole weeks from the week start, 4 to 6 of them", () => {
    const october = monthWeeks("2026-10", 1);
    expect(october).toHaveLength(5);
    expect(october[0]?.[0]).toBe("2026-09-28");
    expect(october[4]?.[6]).toBe("2026-11-01");
    expect(monthWeeks("2026-02", 0)).toHaveLength(4); // 1 February 2026 is a Sunday, 28 days
    expect(monthWeeks("2026-08", 1)).toHaveLength(6); // 1 August 2026 is a Saturday, 31 days
    expect(monthWeeks("2026-12", 1).at(-1)?.at(-1)).toBe("2027-01-03"); // across the new year
  });
});

describe("fitInCell", () => {
  it("shows all that fit, otherwise one less and the rest as +N more", () => {
    expect(fitInCell(3, 3)).toEqual({ shown: 3, more: 0 });
    expect(fitInCell(5, 3)).toEqual({ shown: 2, more: 3 });
    expect(fitInCell(2, 0)).toEqual({ shown: 0, more: 2 }); // no room: only "+2 more"
    expect(fitInCell(0, 4)).toEqual({ shown: 0, more: 0 });
  });
});

describe("monthTitle", () => {
  it("names the month in the interface language", () => {
    expect(monthTitle("2026-10", "en")).toBe("October 2026");
  });
});
