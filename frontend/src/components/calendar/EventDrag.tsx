// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Drag and drop in the week and month grids (FR-CAL-28, C-04, D-78) on
// @dnd-kit/core (the same base will serve the Kanban board). A mouse drag starts after 5 px, a touch drag after a
// 300 ms hold (so a swipe still scrolls); Esc cancels. The drop place is the zone under the pointer: an event lands
// only where it fits (timed on the time grid, all-day in the all-day row, anything on a month day). On the time grid
// the new start is the event's start plus the vertical drag distance (scrolling included), in 15-minute steps. A ghost under the pointer shows the event and
// where it would land ("Fri 30 · 10:00–12:00").
import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { clockText } from "@/lib/dayView";
import type { DropTarget } from "@/lib/eventDrag";
import { itemColorClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

import type { DropData } from "./DropArea";
import type { DragData } from "./EventButton";

const STEP = 15;

const collisions: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

function minutesOf(hhmm: string | null): number | null {
  if (hhmm === null) return null;
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

interface CalendarDndProps {
  /** Pixels per minute of the time grid (week view). */
  minutePx?: number;
  onDrop: (data: DragData, target: DropTarget) => void;
  children: ReactNode;
}

export function CalendarDnd({ minutePx = 1, onDrop, children }: CalendarDndProps) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  const [dragging, setDragging] = useState<{ data: DragData; target: DropTarget | null } | null>(null);

  const targetOf = (event: DragMoveEvent | DragEndEvent): DropTarget | null => {
    const data = event.active.data.current as DragData | undefined;
    const zone = event.over?.data.current as DropData | undefined;
    if (!data || !zone || !event.over || zone.kind !== data.accepts) return null;
    if (zone.kind !== "time") return { day: zone.day };
    // The event's own start plus how far it was dragged (scrolling included), not the ghost's box.
    const raw = Math.round(((minutesOf(data.entry.start) ?? 0) + event.delta.y / minutePx) / STEP) * STEP;
    return { day: zone.day, minutes: Math.min(Math.max(raw, 0), 24 * 60 - STEP) };
  };

  const label = (data: DragData, target: DropTarget | null): string => {
    if (!target) return "";
    const day = new Intl.DateTimeFormat(i18n.language, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
      Date.parse(`${target.day}T00:00:00Z`),
    );
    if (target.minutes === undefined) return day;
    const [start, end] = [minutesOf(data.entry.start), minutesOf(data.entry.end)];
    const length = start !== null && end !== null && end > start ? end - start : null;
    const from = clockText(hhmm(target.minutes), i18n.language, timeFormat);
    const to = length !== null ? clockText(hhmm(target.minutes + length), i18n.language, timeFormat) : null;
    return `${day} · ${to ? `${from}–${to}` : from}`;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={(event: DragStartEvent) => {
        const data = event.active.data.current as DragData | undefined;
        if (data) setDragging({ data, target: null });
      }}
      onDragMove={(event) => {
        setDragging((current) => (current ? { ...current, target: targetOf(event) } : current));
      }}
      onDragEnd={(event) => {
        const data = event.active.data.current as DragData | undefined;
        const target = targetOf(event);
        setDragging(null);
        if (data && target) onDrop(data, target);
      }}
      onDragCancel={() => {
        setDragging(null);
      }}
      accessibility={{
        screenReaderInstructions: { draggable: t("calendar.drag.instructions") },
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div
            className={cn(
              "flex w-44 flex-col rounded-sm py-1 pr-2 pl-2.5 text-xs shadow-lg",
              itemColorClasses(dragging.data.entry.color),
            )}
          >
            <span className="truncate font-medium">{dragging.data.entry.title || t("calendar.day.noTitle")}</span>
            <span className="text-muted tabular-nums">{label(dragging.data, dragging.target)}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
