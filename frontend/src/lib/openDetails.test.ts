import { describe, expect, it } from "vitest";

import { isOpenAt } from "./openDetails";

describe("isOpenAt", () => {
  it("opens the card only where it was opened", () => {
    const open = { key: "e1", place: "2026-11-19" };
    expect(isOpenAt(open, "e1", "2026-11-19")).toBe(true);
    expect(isOpenAt(open, "e1", "2026-11-20")).toBe(false); // the same event shown on the next day
    expect(isOpenAt(open, "e2", "2026-11-19")).toBe(false);
  });

  it("opens it wherever the entry is when no day is given, and nothing when no card is open", () => {
    expect(isOpenAt({ key: "e1", place: null }, "e1", "2026-11-19")).toBe(true);
    expect(isOpenAt(null, "e1", "2026-11-19")).toBe(false);
  });
});
