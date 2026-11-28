// +++===+++ 2026-11-25 18:27 +04 — Hasan Alizada — HAAL-196. Folding a one-line bar until it fits: level 0 shows
// everything, each level folds one more thing. The bar carries the attributes data-fold-1 … data-fold-N up to its level
// and its children fold by them (Tailwind group-data-[fold-1]:…). After every render and on every resize, before the
// browser paints, the levels are tried from 0: the children are measured at their natural widths (with the gaps and the
// padding) against the bar's width, and the first level that fits stays; when none does, the bar also gets
// data-fold-wrap and wraps where the caller chose, its second line folded only as far as it needs. No state, so no extra render and no swinging between two levels.
// Fixed thresholds could not do this: what the bar needs changes with the date, the view, the sidebar and the buttons.
import { type RefObject, useLayoutEffect } from "react";

/**
 * The width the children of `bar` need on one line; `afterBreak`: only those after the child marked data-fold-break
 * (the second line of a wrapped bar).
 */
export function neededWidth(bar: HTMLElement, afterBreak = false): number {
  const style = getComputedStyle(bar);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const children = [...bar.children];
  const mark = afterBreak ? children.findIndex((child) => child.hasAttribute("data-fold-break")) : -1;
  const shown = children
    .slice(mark + 1)
    .filter(
      (child): child is HTMLElement => child instanceof HTMLElement && getComputedStyle(child).display !== "none",
    );
  const widths = shown.map((child) => Math.max(child.offsetWidth, child.scrollWidth));
  return padding + widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, shown.length - 1);
}

/** Puts the attributes of `level` on the bar (data-fold-1 … data-fold-level present, the others absent). */
function apply(bar: HTMLElement, level: number, max: number, wrap = false): void {
  for (let n = 1; n <= max; n++) bar.toggleAttribute(`data-fold-${String(n)}`, n <= level);
  bar.toggleAttribute("data-fold-wrap", wrap);
}

/**
 * Folds the bar to the first level at which it fits on one line and returns it; when even level `oneLine` does not fit,
 * the bar gets data-fold-wrap (its children break it into two lines at the child marked data-fold-break) and the
 * levels are tried again for the second line.
 */
export function fit(bar: HTMLElement, max: number, oneLine = max): number {
  for (let level = 0; level <= oneLine; level++) {
    apply(bar, level, max);
    if (neededWidth(bar) <= bar.clientWidth) return level;
  }
  // Two lines: the second one folds only as far as it needs to.
  for (let level = 0; level <= max; level++) {
    apply(bar, level, max, true);
    if (neededWidth(bar, true) <= bar.clientWidth) return level;
  }
  return max;
}

/**
 * Keeps `ref`'s bar folded to fit, on one line up to level `oneLine`, past it on two (`enabled` false, e.g. on a phone
 * where it wraps by design: folded fully).
 */
export function useFitLevel(
  ref: RefObject<HTMLElement | null>,
  max: number,
  { enabled = true, oneLine = max }: { enabled?: boolean; oneLine?: number } = {},
): void {
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    if (!enabled) {
      apply(bar, max, max, true);
      return;
    }
    fit(bar, max, oneLine);
  });

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || !enabled || typeof ResizeObserver === "undefined") return;
    let width = bar.clientWidth;
    const observer = new ResizeObserver(() => {
      // Folding changes the bar's height, not its width: only a new width asks again.
      if (bar.clientWidth === width) return;
      width = bar.clientWidth;
      fit(bar, max, oneLine);
    });
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, [ref, max, enabled, oneLine]);
}
