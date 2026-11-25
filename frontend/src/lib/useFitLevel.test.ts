// +++===+++ 2026-11-25 18:27 +04 — Hasan Alizada — HAAL-196. Folding a bar until it fits: the first level that fits on
// one line, and when none does, two lines broken at the marked child with the second line folded only as far as needed.
// The widths are given (jsdom does not lay out): each child knows its width at each level of the bar.
import { describe, expect, it } from "vitest";

import { fit, neededWidth } from "./useFitLevel";

const levelOf = (bar: HTMLElement) => [1, 2, 3, 4].filter((n) => bar.hasAttribute(`data-fold-${String(n)}`)).length;

/** A bar of `available` px; each child's width by the bar's level; `breakAfter`: index of the child marked data-fold-break. */
function bar(available: number, widths: number[][], breakAfter?: number): HTMLElement {
  const element = document.createElement("div");
  element.style.columnGap = "8px";
  element.style.paddingLeft = "10px";
  element.style.paddingRight = "10px";
  Object.defineProperty(element, "clientWidth", { value: available, writable: true });
  widths.forEach((byLevel, index) => {
    const child = document.createElement("div");
    if (index === breakAfter) child.setAttribute("data-fold-break", "");
    const width = () => byLevel[levelOf(element)] ?? byLevel.at(-1) ?? 0;
    Object.defineProperty(child, "offsetWidth", { get: width });
    Object.defineProperty(child, "scrollWidth", { get: width });
    element.append(child);
  });
  return element;
}

// Nav 150, title 250, break 0, views 300; Notes & cards 140 → 40; New event 120 → 40; search 160 → 112 → 112.
const header = [[150], [250], [0], [300], [140, 40], [120, 120, 40], [160, 160, 160, 112]];

describe("fit", () => {
  it("measures the children with their gaps and the padding", () => {
    const element = bar(2000, [[100], [200]]);
    expect(neededWidth(element)).toBe(20 + 300 + 8);
  });

  it("folds one more thing at each level until the bar fits on one line", () => {
    // Everything: 20 + 1120 + 6 × 8 = 1188.
    expect(fit(bar(1200, header), 3)).toBe(0);
    const narrower = bar(1100, header);
    expect(fit(narrower, 3)).toBe(1);
    expect(narrower.hasAttribute("data-fold-1")).toBe(true);
    expect(narrower.hasAttribute("data-fold-2")).toBe(false);
    expect(fit(bar(1010, header), 3)).toBe(2);
    expect(fit(bar(960, header), 3)).toBe(3);
  });

  it("breaks into two lines when nothing fits, the second folded only as far as it needs", () => {
    const narrow = bar(700, header, 2);
    // Second line: views 300, Notes & cards, New event, search with three gaps and the padding.
    expect(fit(narrow, 3)).toBe(1);
    expect(narrow.hasAttribute("data-fold-wrap")).toBe(true);
    expect(neededWidth(narrow, true)).toBe(20 + 300 + 40 + 120 + 160 + 3 * 8);
    // Wide again: one line, nothing folded.
    Object.defineProperty(narrow, "clientWidth", { value: 1300 });
    expect(fit(narrow, 3)).toBe(0);
    expect(narrow.hasAttribute("data-fold-wrap")).toBe(false);
  });

  it("keeps the last levels for the second line", () => {
    // Views by their first letter (300 → 120) only past level 2 on one line: two lines first.
    const views = [[150], [250], [0], [300, 300, 300, 300, 120], [140, 40], [120, 120, 40], [160, 160, 160, 112]];
    const element = bar(1000, views, 2);
    expect(fit(element, 4, 2)).toBe(0);
    expect(element.hasAttribute("data-fold-wrap")).toBe(true);
    const narrow = bar(500, views, 2);
    expect(fit(narrow, 4, 2)).toBe(4);
    expect(narrow.hasAttribute("data-fold-4")).toBe(true);
  });
});
