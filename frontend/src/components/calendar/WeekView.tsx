// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. Week view (FR-CAL-25, C-01, wireframe D4, D-75): 7 day columns from
// the user's week start; on top a row of all-day events (a chip on every day an event covers); below a 24-hour grid
// (48 px an hour) with the timed events by time, overlapping ones side by side (layoutDay), events over midnight cut
// at the day's edge as in the day list. Today's column is marked and carries the current-time line, moved every
// minute. On opening a week the grid scrolls to an hour before now when today is in it, otherwise to 08:00. An event
// opens the same details card as in the day list (popover next to it; on phones the page's sheet). The same narrow
// grid on phones (titles cut). Each day is a list for screen readers ("Tuesday, October 27, 2026"); an event's name is
// "Details of <title>", its time is its description.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type DayEntry, clockText, dayLabel, entriesOn } from "@/lib/dayView";
import { itemColorClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { DAY_MINUTES, MIN_MINUTES, layoutDay } from "@/lib/weekView";

type Row = Record<string, unknown>;

export const HOUR_PX = 48;
const MINUTE_PX = HOUR_PX / 60;

/** Minutes after midnight now in `timeZone`, moved every minute. */
function useMinuteOfDay(timeZone: string): number {
  const read = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return Number(parts.hour) * 60 + Number(parts.minute);
  };
  const [minute, setMinute] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => {
      setMinute(read());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read depends on timeZone only
  }, [timeZone]);
  return minute;
}

interface WeekGridProps {
  days: readonly string[];
  rows: readonly Row[];
  viewerTz: string;
  today: string;
  /** The entry whose details are open (its key). */
  openKey: string | null;
  onOpen: (entry: DayEntry) => void;
  onClose: () => void;
  /** Details next to the event (popover); false on phones, where the page shows them in a sheet. */
  inPopover: boolean;
  details: (entry: DayEntry) => ReactNode;
}

export function WeekGrid({ days, rows, viewerTz, today, openKey, onOpen, onClose, inPopover, details }: WeekGridProps) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const now = useMinuteOfDay(viewerTz);
  const scroller = useRef<HTMLDivElement>(null);
  const week = useMemo(
    () =>
      days.map((day) => {
        const entries = entriesOn(rows, day, viewerTz);
        return { day, allDay: entries.filter((entry) => entry.allDay), timed: layoutDay(entries) };
      }),
    [days, rows, viewerTz],
  );
  const hasToday = days.includes(today);

  // A new week opens an hour before now (this week) or at 08:00; re-renders of the same week keep the scroll.
  const firstDay = days[0];
  useEffect(() => {
    const top = hasToday ? Math.max(0, now - 60) * MINUTE_PX : 8 * HOUR_PX;
    if (scroller.current) scroller.current.scrollTop = top;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the week changes
  }, [firstDay]);

  const name = (entry: DayEntry) => t("calendar.day.details", { title: entry.title || t("calendar.day.noTitle") });
  const time = (entry: DayEntry) => {
    if (entry.allDay || entry.start === null || entry.end === null) return t("calendar.day.allDay");
    const [start, end] = [
      clockText(entry.start, i18n.language, timeFormat),
      clockText(entry.end, i18n.language, timeFormat),
    ];
    if (entry.continues && entry.goesOn) return t("calendar.day.allDayContinues");
    if (entry.continues) return t("calendar.day.until", { time: end });
    if (entry.goesOn) return t("calendar.day.from", { time: start });
    return start === end ? start : `${start}–${end}`;
  };
  const withDetails = (entry: DayEntry, button: ReactNode) =>
    inPopover ? (
      <Popover
        open={openKey === entry.key}
        onOpenChange={(open) => {
          if (open) onOpen(entry);
          else onClose();
        }}
      >
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          aria-label={t("calendar.details.title")}
          className="max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
        >
          {openKey === entry.key ? details(entry) : null}
        </PopoverContent>
      </Popover>
    ) : (
      button
    );
  const eventProps = (entry: DayEntry, describedBy: string) => ({
    type: "button" as const,
    "aria-label": name(entry),
    "aria-describedby": describedBy,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": openKey === entry.key,
    onClick: inPopover
      ? undefined
      : () => {
          onOpen(entry);
        },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      onOpen(entry);
    },
  });

  const columns = "grid grid-cols-[2.75rem_repeat(7,minmax(0,1fr))] md:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";
  return (
    <div className="flex h-full min-h-0 flex-col text-xs">
      <div className={cn(columns, "border-b border-line")} aria-hidden>
        <span />
        {days.map((day) => {
          const date = new Date(Date.parse(`${day}T00:00:00Z`));
          return (
            <div
              key={day}
              className={cn("border-l border-line px-0.5 py-1 text-center", day === today && "text-primary")}
            >
              <span className="block truncate text-muted">
                {new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(date)}
              </span>
              <span className="block text-base font-semibold tabular-nums">{date.getUTCDate()}</span>
            </div>
          );
        })}
      </div>
      <div className={cn(columns, "border-b border-line")}>
        <span className="self-center pr-1 text-right text-[10.5px] text-muted">{t("calendar.week.allDay")}</span>
        {week.map(({ day, allDay }) => (
          <ul
            key={day}
            aria-label={t("calendar.week.allDayOf", { date: dayLabel(day, i18n.language) })}
            className="flex min-h-8 min-w-0 flex-col gap-0.5 border-l border-line p-0.5"
          >
            {allDay.map((entry) => {
              const id = `week-${day}-${entry.key}`;
              return (
                <li key={entry.key} className="min-w-0">
                  {withDetails(
                    entry,
                    <button
                      {...eventProps(entry, id)}
                      className={cn(
                        "w-full truncate rounded-sm py-0.5 pr-1 pl-2 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        itemColorClasses(entry.color),
                      )}
                    >
                      {entry.title || t("calendar.day.noTitle")}
                      <span id={id} className="sr-only">
                        {time(entry)}
                      </span>
                    </button>,
                  )}
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className={columns} style={{ height: 24 * HOUR_PX }}>
          <div className="relative" aria-hidden>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <span
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[10.5px] text-muted tabular-nums"
                style={{ top: hour * HOUR_PX }}
              >
                {clockText(`${String(hour).padStart(2, "0")}:00`, i18n.language, timeFormat)}
              </span>
            ))}
          </div>
          {week.map(({ day, timed }) => (
            <ol
              key={day}
              aria-label={dayLabel(day, i18n.language)}
              className={cn(
                "relative border-l border-line",
                "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,var(--color-line)_47px,var(--color-line)_48px)]",
                day === today && "bg-primary-tint/30",
              )}
            >
              {timed.map((block) => {
                const id = `week-${day}-${block.entry.key}`;
                const height = Math.max(block.end - block.start, MIN_MINUTES) * MINUTE_PX;
                return (
                  <li
                    key={block.entry.key}
                    className="absolute px-px"
                    style={{
                      top: block.start * MINUTE_PX,
                      height: Math.min(height, (DAY_MINUTES - block.start) * MINUTE_PX),
                      left: `${String((block.column / block.columns) * 100)}%`,
                      width: `${String(100 / block.columns)}%`,
                    }}
                  >
                    {withDetails(
                      block.entry,
                      <button
                        {...eventProps(block.entry, id)}
                        className={cn(
                          "flex size-full flex-col overflow-hidden rounded-sm py-0.5 pr-1 pl-2 text-left leading-tight outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          itemColorClasses(block.entry.color),
                        )}
                      >
                        <span className="truncate font-medium">{block.entry.title || t("calendar.day.noTitle")}</span>
                        <span id={id} className={cn("truncate text-muted", height < 36 && "sr-only")}>
                          {time(block.entry)}
                        </span>
                      </button>,
                    )}
                  </li>
                );
              })}
              {day === today ? (
                <li
                  aria-hidden
                  data-testid="now-line"
                  className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger"
                  style={{ top: now * MINUTE_PX }}
                >
                  <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-danger" />
                </li>
              ) : null}
            </ol>
          ))}
        </div>
      </div>
    </div>
  );
}
