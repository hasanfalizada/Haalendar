// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F4). Which drop zone of a calendar grid a drag is over:
// the zone under the pointer; the dragged box's overlap only fills the gaps between zones (their borders), never a
// pointer outside the grid, so an event let go off the grid stays where it was instead of landing on the nearest edge
// day. Without pointer coordinates the overlap decides, as before.
import { type CollisionDetection, pointerWithin, rectIntersection } from "@dnd-kit/core";

export const dropZoneUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  const point = args.pointerCoordinates;
  if (point) {
    const zones = [...args.droppableRects.values()];
    const inside =
      zones.length > 0 &&
      point.x >= Math.min(...zones.map((r) => r.left)) &&
      point.x <= Math.max(...zones.map((r) => r.right)) &&
      point.y >= Math.min(...zones.map((r) => r.top)) &&
      point.y <= Math.max(...zones.map((r) => r.bottom));
    if (!inside) return [];
  }
  return rectIntersection(args);
};
