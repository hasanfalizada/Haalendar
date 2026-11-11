// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. Mini month calendar (FR-CAL-02, F-01, D-62): six weeks from the
// user's first day of the week, weekday names in the interface language, days of the neighbouring months dimmed but
// selectable, today ringed, the selected day filled, a dot under days with events. ‹ › page the month without changing
// the selected day; when the selected day moves to another month the calendar follows. Keyboard: ARIA grid pattern —
// one Tab stop, arrows move by day / week, PageUp / PageDown by month, Home / End to the start / end of the week,
// Enter / Space select. Cells are 44 px on touch, compact with a mouse.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-097. ISO week numbers (FR-CAL-35, C-12, D-85): a narrow first column,
// always shown, a row header ("Week 46") and no button — the day keys stay as they are. A week that starts on Sunday or
// Saturday spans two ISO weeks: the row shows the week of its Thursday, the one most of its days belong to.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isoWeek } from "@/atoms/calendar/isoWeek";
import { Button } from "@/components/ui/button";
import { addDays } from "@/lib/datetime";
import { dayLabel } from "@/lib/dayView";
import { addMonths, monthGrid, monthOf, sameDayIn, weekStartOf, weekdayOrder } from "@/lib/monthGrid";
import { cn } from "@/lib/utils";

interface MiniMonthProps {
  selected: string;
  today: string;
  weekStart: number;
  /** Days that have events (dot). */
  marked: ReadonlySet<string>;
  onSelect: (date: string) => void;
  /** Called with the month shown, so the caller can mark its days. */
  onMonthShown?: (days: readonly string[]) => void;
}

function monthLabel(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.parse(`${month}-01T00:00:00Z`),
  );
}

function weekdayNames(weekStart: number, locale: string): { short: string; long: string }[] {
  // 2023-01-01 was a Sunday.
  return weekdayOrder(weekStart).map((day) => {
    const date = Date.UTC(2023, 0, 1 + day);
    return {
      short: new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(date),
      long: new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date),
    };
  });
}

function WeekNumber({ date }: { date: string }) {
  const { t } = useTranslation();
  const { week, week_year: year } = isoWeek(date);
  return (
    <th
      scope="row"
      role="rowheader"
      title={t("calendar.header.weekTitle", { week, year })}
      className="p-0 text-center text-[10px] font-normal text-muted tabular-nums"
    >
      <span aria-hidden>{week}</span>
      <span className="sr-only">{t("calendar.nav.weekRow", { week })}</span>
    </th>
  );
}

export function MiniMonth({ selected, today, weekStart, marked, onSelect, onMonthShown }: MiniMonthProps) {
  const { t, i18n } = useTranslation();
  const [shown, setShown] = useState(monthOf(selected));
  const [focusDate, setFocusDate] = useState(selected);
  const moved = useRef(false);
  const grid = useRef<HTMLTableElement>(null);
  const days = monthGrid(shown, weekStart);

  // The calendar follows the selected day (prev / next day, Today, the URL) — adjusted while rendering, React's pattern
  // for state derived from a changed prop.
  const [followed, setFollowed] = useState(selected);
  if (followed !== selected) {
    setFollowed(selected);
    setShown(monthOf(selected));
    setFocusDate(selected);
  }

  const daysKey = days.join(",");
  useEffect(() => {
    onMonthShown?.(daysKey.split(","));
  }, [daysKey, onMonthShown]);

  // After a keyboard move the focus follows the new day (also into another month).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, shown]);

  const focusable = days.includes(focusDate) ? focusDate : (days.find((d) => monthOf(d) === shown) ?? days[0]);

  function moveTo(date: string) {
    moved.current = true;
    setFocusDate(date);
    if (monthOf(date) !== shown && !monthGrid(shown, weekStart).includes(date)) setShown(monthOf(date));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const from = focusable ?? selected;
    const target: Record<string, () => string> = {
      ArrowLeft: () => addDays(from, -1),
      ArrowRight: () => addDays(from, 1),
      ArrowUp: () => addDays(from, -7),
      ArrowDown: () => addDays(from, 7),
      Home: () => weekStartOf(from, weekStart),
      End: () => addDays(weekStartOf(from, weekStart), 6),
      PageUp: () => sameDayIn(from, addMonths(monthOf(from), -1)),
      PageDown: () => sameDayIn(from, addMonths(monthOf(from), 1)),
    };
    const next = target[event.key];
    if (next) {
      event.preventDefault();
      event.stopPropagation(); // the page's ← / → day keys must not fire as well
      const date = next();
      if (event.key === "PageUp" || event.key === "PageDown") {
        moved.current = true;
        setShown(monthOf(date));
        setFocusDate(date);
      } else {
        moveTo(date);
      }
    }
  }

  const names = weekdayNames(weekStart, i18n.language);
  const label = monthLabel(shown, i18n.language);
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const thursday = weekdayOrder(weekStart).indexOf(4);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("calendar.nav.previousMonth")}
          onClick={() => {
            setShown(addMonths(shown, -1));
          }}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="text-[13px] font-semibold" aria-live="polite">
          {label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("calendar.nav.nextMonth")}
          onClick={() => {
            setShown(addMonths(shown, 1));
          }}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <table
        ref={grid}
        role="grid"
        aria-label={label}
        className="w-full table-fixed border-collapse"
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            <th
              scope="col"
              abbr={t("calendar.nav.weekColumnLong")}
              className="w-[2.25em] pb-1 text-center text-[10px] font-medium text-muted"
            >
              {t("calendar.nav.weekColumn")}
            </th>
            {names.map((name) => (
              <th
                key={name.long}
                scope="col"
                abbr={name.long}
                className="pb-1 text-center text-[11px] font-medium text-muted"
              >
                {name.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              <WeekNumber date={week[thursday] ?? week[0] ?? selected} />
              {week.map((date) => {
                const isSelected = date === selected;
                const isToday = date === today;
                const outside = monthOf(date) !== shown;
                const extra = [
                  isToday ? t("calendar.nav.todayMark") : "",
                  marked.has(date) ? t("calendar.nav.hasEvents") : "",
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <td key={date} role="gridcell" aria-selected={isSelected} className="p-0 text-center">
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={date === focusable ? 0 : -1}
                      aria-label={extra ? `${dayLabel(date, i18n.language)}, ${extra}` : dayLabel(date, i18n.language)}
                      {...(isToday ? { "aria-current": "date" as const } : {})}
                      onClick={() => {
                        setFocusDate(date);
                        onSelect(date);
                      }}
                      className={cn(
                        "relative inline-flex h-11 w-full items-center justify-center rounded-sm text-[13px] tabular-nums outline-none pointer-fine:md:h-8",
                        "hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary",
                        outside && "text-muted",
                        isToday && !isSelected && "font-semibold text-primary ring-1 ring-primary ring-inset",
                        isSelected && "bg-primary font-semibold text-primary-ink hover:bg-primary-hover",
                      )}
                    >
                      {Number(date.slice(8, 10))}
                      {marked.has(date) ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full",
                            isSelected ? "bg-primary-ink" : "bg-primary",
                          )}
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
