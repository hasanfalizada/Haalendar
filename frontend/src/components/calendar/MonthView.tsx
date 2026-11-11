// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. Month view (FR-CAL-26, C-02, wireframe D5, D-76): the weeks the month
// touches (4 to 6) from the user's week start, filling the height. A day shows its events in the day list's order
// ("09:00 Standup", all-day ones by title; an event covering several days on each of them) as many as fit the cell —
// measured, again when the size changes — and "+N more"; days of the neighbouring months are dimmed, today is marked,
// the selected date ringed. An event opens its details card; the day number, the empty space of a cell and "+N more"
// open that day in the day view. On phones (cells about 50 px wide) a cell is one button: up to three colour bars
// and "+N", a tap opens the day.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. The month's entries come from entriesOnDays (one pass for all days).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Drag and drop (D-78): an event onto another day keeps its times (an
// event over several days moves by the days between the cell it was taken from and the one it lands on). Not on
// phones, where a cell is one button.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { type DayEntry, dayLabel, entriesOnDays } from "@/lib/dayView";
import type { DropTarget } from "@/lib/eventDrag";
import { useEntryTime } from "@/lib/entryTime";
import { weekdayOrder } from "@/lib/monthGrid";
import { fitInCell } from "@/lib/monthView";
import { itemColorClasses, swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

import { DropArea } from "./DropArea";
import { type DetailsAnchor, type DragData, EventButton } from "./EventButton";
import { CalendarDnd } from "./EventDrag";

type Row = Record<string, unknown>;

/** Height of one event line in a cell (chip 20 px + gap 2 px) and of the day number above them. */
const LINE_PX = 22;
const NUMBER_PX = 26;
/** Lines assumed until the cells are measured (and where nothing can be measured, as in tests). */
const DEFAULT_LINES = 3;
const PHONE_BARS = 3;

/** How many event lines fit into a cell of the grid in `ref` with `weeks` rows. */
function useLinesPerCell(weeks: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState(DEFAULT_LINES);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const height = element.clientHeight / weeks;
      if (height > 0) setLines(Math.max(1, Math.floor((height - NUMBER_PX) / LINE_PX)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [weeks]);
  return { ref, lines };
}

interface MonthGridProps {
  weeks: readonly string[][];
  /** The month shown ("YYYY-MM"). */
  month: string;
  /** The selected date. */
  date: string;
  today: string;
  rows: readonly Row[];
  viewerTz: string;
  anchor: DetailsAnchor;
  /** Phones: a cell is one button with colour bars. */
  compact: boolean;
  /** Opens the day view of a date. */
  onDay: (date: string) => void;
  /** May this event be dragged (its calendar is writable)? */
  canDrag: (entry: DayEntry) => boolean;
  onDrop: (data: DragData, target: DropTarget) => void;
}

export function MonthGrid({
  weeks,
  month,
  date,
  today,
  rows,
  viewerTz,
  anchor,
  compact,
  onDay,
  canDrag,
  onDrop,
}: MonthGridProps) {
  const { t, i18n } = useTranslation();
  const time = useEntryTime();
  const { ref, lines } = useLinesPerCell(weeks.length);
  const byDay = useMemo(() => entriesOnDays(rows, weeks.flat(), viewerTz), [weeks, rows, viewerTz]);
  const firstWeek = weeks[0] ?? [];

  return (
    <CalendarDnd onDrop={onDrop}>
      <div className="flex h-full min-h-0 flex-col text-xs">
        <div className="grid grid-cols-7 border-b border-line" aria-hidden>
          {weekdayOrder(new Date(Date.parse(`${firstWeek[0] ?? month}T00:00:00Z`)).getUTCDay()).map((weekday) => (
            <span key={weekday} className="truncate px-1 py-1 text-center text-muted">
              {new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(
                Date.UTC(2023, 0, 1 + weekday), // 1 January 2023 was a Sunday
              )}
            </span>
          ))}
        </div>
        <div
          ref={ref}
          className="grid min-h-0 flex-1 grid-cols-7 overflow-y-auto"
          style={{ gridTemplateRows: `repeat(${String(weeks.length)}, minmax(5.5rem, 1fr))` }}
        >
          {weeks.flat().map((day) => {
            const entries = byDay.get(day) ?? [];
            const outside = day.slice(0, 7) !== month;
            const label = dayLabel(day, i18n.language);
            const number = (
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full tabular-nums",
                  day === today && "bg-primary font-semibold text-primary-ink",
                )}
              >
                {Number(day.slice(8, 10))}
              </span>
            );
            const cellClass = cn(
              "flex min-h-0 min-w-0 flex-col gap-0.5 border-r border-b border-line p-0.5 [&:nth-child(7n)]:border-r-0",
              outside && "bg-surface/60 text-muted",
              day === date && "outline-2 -outline-offset-2 outline-primary",
            );
            if (compact) {
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={t("calendar.month.openDayCount", { date: label, count: entries.length })}
                  onClick={() => {
                    onDay(day);
                  }}
                  className={cn(cellClass, "items-center text-left")}
                >
                  {number}
                  {entries.slice(0, PHONE_BARS).map((entry) => (
                    <span
                      key={entry.key}
                      aria-hidden
                      className={cn("h-1.5 w-full rounded-full", swatchClasses(entry.color))}
                    />
                  ))}
                  {entries.length > PHONE_BARS ? (
                    <span aria-hidden className="text-[10.5px] text-muted">
                      +{entries.length - PHONE_BARS}
                    </span>
                  ) : null}
                </button>
              );
            }
            const { shown, more } = fitInCell(entries.length, lines);
            return (
              <DropArea
                id={`day:${day}`}
                data={{ kind: "day", day }}
                key={day}
                className={cellClass}
                onClick={(event) => {
                  // The empty space of a cell opens the day; its buttons handle their own clicks.
                  if (!(event.target instanceof Element) || !event.target.closest("button")) onDay(day);
                }}
              >
                <button
                  type="button"
                  aria-label={t("calendar.month.openDay", { date: label })}
                  onClick={() => {
                    onDay(day);
                  }}
                  className="w-fit rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {number}
                </button>
                <ul aria-label={label} className="flex min-w-0 flex-col gap-0.5">
                  {entries.slice(0, shown).map((entry) => {
                    const id = `month-${day}-${entry.key}`;
                    const start = time.start(entry);
                    return (
                      <li key={entry.key} className="min-w-0">
                        <EventButton
                          entry={entry}
                          anchor={anchor}
                          describedBy={id}
                          drag={{ day, accepts: "day", disabled: !canDrag(entry) }}
                          className={cn(
                            "flex h-5 w-full items-center gap-1 rounded-sm pr-1 pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            itemColorClasses(entry.color),
                          )}
                        >
                          {start ? (
                            <span aria-hidden className="shrink-0 text-muted tabular-nums">
                              {start}
                            </span>
                          ) : null}
                          <span className="truncate font-medium">{entry.title || t("calendar.day.noTitle")}</span>
                          <span id={id} className="sr-only">
                            {time.range(entry)}
                          </span>
                        </EventButton>
                      </li>
                    );
                  })}
                </ul>
                {more > 0 ? (
                  <button
                    type="button"
                    aria-label={t("calendar.month.moreOn", { count: more, date: label })}
                    onClick={() => {
                      onDay(day);
                    }}
                    className="w-fit rounded-sm px-1 text-left font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {t("calendar.month.more", { count: more })}
                  </button>
                ) : null}
              </DropArea>
            );
          })}
        </div>
      </div>
    </CalendarDnd>
  );
}
