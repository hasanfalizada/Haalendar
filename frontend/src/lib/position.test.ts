// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Position keys (D-87): between, time keys, new on top.
import { describe, expect, it } from "vitest";

import { comparePositions, keyBetween, timeKey, topPosition } from "./position";

const valid = /^[0-9A-Za-z]{1,64}$/;

describe("positions", () => {
  it("puts a key between two others, at the start and at the end", () => {
    for (const [a, b] of [
      ["", "U"],
      ["U", null],
      ["A", "B"],
      ["A", "A1"],
      ["", "1"],
      ["Az", "B"],
      ["z", null],
    ] as const) {
      const key = keyBetween(a, b);
      expect(key).toMatch(valid);
      expect(comparePositions(a, key)).toBeLessThan(0);
      if (b !== null) expect(comparePositions(key, b)).toBeLessThan(0);
    }
  });

  it("later times sort first and keep eight characters at most", () => {
    const earlier = timeKey(Date.parse("2026-10-29T10:00:00Z"));
    const later = timeKey(Date.parse("2026-10-29T10:00:00.001Z"));
    expect(comparePositions(later, earlier)).toBeLessThan(0);
    expect(earlier.length).toBeLessThanOrEqual(8);
    expect(earlier).toMatch(valid);
  });

  it("a new record goes on top, also before a key moved there by hand", () => {
    const now = Date.parse("2026-10-29T10:00:00Z");
    const keys: string[] = [];
    for (let i = 0; i < 500; i++) keys.push(topPosition(keys, now + i));
    expect([...keys].sort(comparePositions)).toEqual([...keys].reverse());
    expect(Math.max(...keys.map((key) => key.length))).toBeLessThanOrEqual(8);
    const manual = keyBetween("", keys[keys.length - 1] ?? null);
    const next = topPosition([...keys, manual], now + 1000);
    expect(comparePositions(next, manual)).toBeLessThan(0);
    expect(topPosition([])).toMatch(valid);
  });
});
