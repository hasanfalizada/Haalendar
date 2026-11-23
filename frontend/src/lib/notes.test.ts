// +++===+++ 2026-11-18 15:40 +04 — Hasan Alizada — HAAL-103. Manual order of notes (FR-TODO-05, D-110): a move among the
// notes shown becomes a place among the whole section; a step or a drop gives the place, nothing at an edge.
import { describe, expect, it } from "vitest";

import { dropIndex, movedPosition, stepIndex } from "./notes";
import { comparePositions } from "./position";

const a = { id: "a", position: "C" };
const b = { id: "b", position: "M" };
const c = { id: "c", position: "T" };
const d = { id: "d", position: "X" };
const section = [a, b, c, d];

const between = (key: string | null, low: string, high: string) => {
  expect(key).not.toBeNull();
  expect(comparePositions(String(key), low)).toBe(1);
  expect(comparePositions(String(key), high)).toBe(-1);
};

describe("order of notes", () => {
  it("puts a note between its new neighbours; nothing when it is there already", () => {
    between(movedPosition(section, section, a, 2), "T", "X");
    between(movedPosition(section, section, d, 0), "", "C");
    expect(comparePositions(String(movedPosition(section, section, a, 3)), "X")).toBe(1);
    expect(movedPosition(section, section, b, 1)).toBeNull();
    expect(movedPosition(section, section, b, 9)).toBeNull();
  });

  it("among the notes shown, the hidden ones keep their places", () => {
    const shown = [b, d];
    // d before b: right after the hidden a, before b.
    between(movedPosition(section, shown, d, 0), "C", "M");
    // b after d: after d, the hidden c stays before it.
    expect(comparePositions(String(movedPosition(section, shown, b, 1)), "X")).toBe(1);
    // b at its own place among the shown ones stays, not past the hidden c (nor a).
    expect(movedPosition(section, shown, b, 0)).toBeNull();
    expect(movedPosition(section, [a, b, d], d, 2)).toBeNull();
  });

  it("a step goes one place, a drop takes the target's place; nothing at an edge or on itself", () => {
    expect(stepIndex(section, b, -1)).toBe(0);
    expect(stepIndex(section, b, 1)).toBe(2);
    expect(stepIndex(section, a, -1)).toBeNull();
    expect(stepIndex(section, d, 1)).toBeNull();
    expect(stepIndex(section, { id: "x" }, 1)).toBeNull();
    expect(dropIndex(section, a, c)).toBe(2);
    expect(dropIndex(section, d, b)).toBe(1);
    expect(dropIndex(section, b, b)).toBeNull();
    expect(dropIndex(section, { id: "x" }, b)).toBeNull();
    between(movedPosition(section, section, a, Number(dropIndex(section, a, c))), "T", "X");
    between(movedPosition(section, section, d, Number(dropIndex(section, d, b))), "C", "M");
  });
});
