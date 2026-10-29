// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-098. A horizontal swipe on an element (FR-CAL-36, C-13, D-86): a finger
// only (no mouse, no pen); the finger must go at least SWIPE_DISTANCE px sideways and clearly more sideways than up or
// down (otherwise it is a vertical scroll), and start moving within FLICK_WITHIN ms (a hold is a drag or a long press,
// not a swipe). Touches that start near the screen's sides (the system's Back gesture) or in a field are left alone.
// Meanwhile the element follows the finger a little (damped, at most a third of its width) and springs back when the
// swipe falls short; with reduced motion it stays still. Native listeners on the element itself, so touches in dialogs
// and popovers (portals elsewhere in the page) never count.
import { useEffect, useRef, useState } from "react";

export const SWIPE_DISTANCE = 60;
/** How much more sideways than vertical the movement must be. */
export const SWIPE_RATIO = 1.5;
/** Touches starting this close to the screen's left or right side belong to the system. */
export const EDGE = 24;
/** The finger must start moving within this time; a longer hold is a drag or a long press. */
export const FLICK_WITHIN = 300;
/** Movement before the direction is decided. */
const SLOP = 10;
const FOLLOW = 0.4;
const SPRING = "transform 180ms ease-out";

/** -1: towards the previous period (finger to the right), 1: towards the next (finger to the left). */
export type SwipeDirection = -1 | 1;

const FIELDS = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The ref to put on the element that takes the swipe. */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void): (element: HTMLElement | null) => void {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const latest = useRef(onSwipe);
  useEffect(() => {
    latest.current = onSwipe;
  }, [onSwipe]);

  useEffect(() => {
    if (!element) return;
    let start: { x: number; y: number; at: number } | null = null;
    let state: "undecided" | "horizontal" | "ignored" = "ignored";
    let dx = 0;

    const place = (offset: number, animate: boolean) => {
      element.style.transition = animate ? SPRING : "";
      element.style.transform = offset ? `translateX(${String(offset)}px)` : "";
    };
    const reset = (animate: boolean) => {
      start = null;
      state = "ignored";
      if (element.style.transform) place(0, animate);
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const stylus = touch !== undefined && "touchType" in touch && touch.touchType === "stylus";
      const field = event.target instanceof Element && event.target.closest(FIELDS) !== null;
      if (event.touches.length !== 1 || !touch || stylus || field) {
        reset(true);
        return;
      }
      if (touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE) {
        reset(true);
        return;
      }
      start = { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
      state = "undecided";
      dx = 0;
    };

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || state === "ignored" || !touch) return;
      if (event.touches.length !== 1) {
        reset(true);
        return;
      }
      dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (state === "undecided") {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        state =
          event.timeStamp - start.at <= FLICK_WITHIN && Math.abs(dx) > SWIPE_RATIO * Math.abs(dy)
            ? "horizontal"
            : "ignored";
        if (state === "ignored") return;
      }
      // Sideways: the page does not scroll meanwhile.
      if (event.cancelable) event.preventDefault();
      if (!reducedMotion()) {
        const limit = element.clientWidth / 3;
        place(Math.max(-limit, Math.min(limit, dx * FOLLOW)), false);
      }
    };

    const onEnd = () => {
      const swiped = state === "horizontal" && Math.abs(dx) >= SWIPE_DISTANCE;
      // The next period replaces the content, so it shows in place; a short swipe springs back.
      reset(!swiped);
      if (swiped) latest.current(dx < 0 ? 1 : -1);
    };
    const onCancel = () => {
      reset(true);
    };

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onCancel);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onCancel);
      element.style.transform = "";
      element.style.transition = "";
    };
  }, [element]);
  return setElement;
}
