// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-098. Swipe (FR-CAL-36, D-86): direction, the distance threshold, vertical
// scrolling, the screen's sides, a stylus, fields, a hold, two fingers, the element following the finger.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDGE, SWIPE_DISTANCE, useSwipe } from "./useSwipe";

function Area({ onSwipe }: { onSwipe: (direction: number) => void }) {
  const ref = useSwipe(onSwipe);
  return (
    <div ref={ref} data-testid="area">
      <input aria-label="Field" />
      <p>content</p>
    </div>
  );
}

const at = (x: number, y: number, extra: object = {}) => ({ clientX: x, clientY: y, ...extra });

function swipe(target: Element, from: [number, number], to: [number, number], extra: object = {}) {
  fireEvent.touchStart(target, { touches: [at(...from, extra)] });
  fireEvent.touchMove(target, { touches: [at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, extra)] });
  fireEvent.touchMove(target, { touches: [at(...to, extra)] });
  fireEvent.touchEnd(target, { touches: [], changedTouches: [at(...to, extra)] });
}

function setup() {
  const onSwipe = vi.fn();
  render(<Area onSwipe={onSwipe} />);
  return { onSwipe, area: screen.getByTestId("area"), text: screen.getByText("content") };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useSwipe", () => {
  it("left goes to the next period, right to the previous", () => {
    const { onSwipe, text } = setup();
    swipe(text, [300, 200], [300 - SWIPE_DISTANCE - 10, 210]);
    swipe(text, [100, 200], [100 + SWIPE_DISTANCE + 10, 190]);
    expect(onSwipe.mock.calls).toEqual([[1], [-1]]);
  });

  it("ignores short swipes, vertical scrolling, the screen's sides, a stylus and fields", () => {
    const { onSwipe, text } = setup();
    swipe(text, [300, 200], [300 - SWIPE_DISTANCE + 10, 200]);
    swipe(text, [300, 100], [200, 300]);
    swipe(text, [EDGE - 4, 200], [EDGE + 150, 200]);
    swipe(text, [window.innerWidth - EDGE + 4, 200], [200, 200]);
    swipe(text, [300, 200], [150, 200], { touchType: "stylus" });
    swipe(screen.getByLabelText("Field"), [300, 200], [150, 200]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("a hold before moving is a drag or a long press, not a swipe; two fingers are a pinch", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { onSwipe, text } = setup();
    fireEvent.touchStart(text, { touches: [at(300, 200)] });
    vi.setSystemTime(Date.now() + 400);
    fireEvent.touchMove(text, { touches: [at(150, 200)] });
    fireEvent.touchEnd(text, { touches: [] });
    expect(onSwipe).not.toHaveBeenCalled();
    vi.useRealTimers();

    fireEvent.touchStart(text, { touches: [at(300, 200)] });
    fireEvent.touchMove(text, { touches: [at(250, 200)] });
    fireEvent.touchMove(text, { touches: [at(150, 200), at(100, 300)] });
    fireEvent.touchEnd(text, { touches: [] });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("the content follows the finger and springs back when the swipe falls short", () => {
    const { area, text } = setup();
    Object.defineProperty(area, "clientWidth", { value: 360 });
    fireEvent.touchStart(text, { touches: [at(300, 200)] });
    fireEvent.touchMove(text, { touches: [at(250, 200)] });
    expect(area.style.transform).toBe("translateX(-20px)");
    fireEvent.touchEnd(text, { touches: [] });
    expect(area.style.transform).toBe("");
    expect(area.style.transition).toContain("transform");
  });
});
