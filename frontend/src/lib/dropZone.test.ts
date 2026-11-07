// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F4). A drop zone only under the pointer or in a gap of
// the grid; let go off the grid, the event lands nowhere (in the UAT it went to the nearest edge day).
import type { ClientRect, CollisionDetection, UniqueIdentifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { dropZoneUnderPointer } from "./dropZone";

type Args = Parameters<CollisionDetection>[0];

const box = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

// Two month cells side by side with a 2 px border between them, 100 × 80 each.
const cells: [UniqueIdentifier, ClientRect][] = [
  ["day-1", box(0, 100, 100, 80)],
  ["day-2", box(102, 100, 100, 80)],
];

function args(pointer: { x: number; y: number } | null, dragged: ClientRect): Args {
  return {
    active: { id: "event", data: { current: {} }, rect: { current: { initial: null, translated: null } } },
    collisionRect: dragged,
    droppableRects: new Map(cells),
    droppableContainers: cells.map(([id]) => ({
      id,
      key: id,
      data: { current: {} },
      disabled: false,
      node: { current: null },
      rect: { current: null },
    })),
    pointerCoordinates: pointer,
  };
}

const ids = (pointer: { x: number; y: number } | null, dragged: ClientRect) =>
  dropZoneUnderPointer(args(pointer, dragged)).map((hit) => hit.id);

describe("drop zone under the pointer", () => {
  it("is the cell under the pointer", () => {
    expect(ids({ x: 150, y: 140 }, box(120, 130, 60, 20))).toEqual(["day-2"]);
  });

  it("on a border between cells, the cell the dragged event overlaps most", () => {
    expect(ids({ x: 101, y: 140 }, box(60, 130, 60, 20))).toEqual(["day-1", "day-2"]);
  });

  it("is none when the pointer is off the grid, even if the event still overlaps an edge cell", () => {
    expect(ids({ x: 150, y: 190 }, box(120, 175, 60, 20))).toEqual([]);
    expect(ids({ x: 210, y: 140 }, box(190, 130, 60, 20))).toEqual([]);
  });
});
