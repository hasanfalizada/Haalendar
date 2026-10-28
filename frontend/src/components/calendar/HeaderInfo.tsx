// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Calendar header details (FR-CAL-05, F-05, D-63):
// - the date title: "Today" or the long date in the interface language, with the weekday;
// - a live clock (hh:mm:ss) in the profile time zone and 12/24-hour setting; it ticks on the second boundary, stops
//   while the tab is hidden and is right again the moment the tab is back; role="timer" without announcements;
// - the ISO 8601 week of the SELECTED date (calendar.iso_week.v1; the legacy app showed the week of today), with the
//   ISO year when it differs from the calendar year ("Week 53 · 2026" on 1 January 2027).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-082, D-71. Day Number of the SELECTED date after the week ("Day 301");
// the tooltip and screen readers get the full "Day 301 of 365".
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { isoWeek } from "@/atoms/calendar/isoWeek";
import { dayOfYear } from "@/lib/dayOfYear";

/** The current time, updated on every second boundary while the tab is visible. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, 1000 - current.getMilliseconds());
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") tick();
    };
    if (document.visibilityState === "visible") timer = setTimeout(tick, 1000 - new Date().getMilliseconds());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}

export function LiveClock({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const now = useNow();
  const text = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
  }).format(now);
  return (
    <span role="timer" aria-live="off" aria-label={t("calendar.header.clock")} className="tabular-nums">
      {text}
    </span>
  );
}

export function IsoWeekLabel({ date }: { date: string }) {
  const { t } = useTranslation();
  const { week, week_year: weekYear } = isoWeek(date);
  const sameYear = weekYear === Number(date.slice(0, 4));
  return (
    <span title={t("calendar.header.weekTitle", { week, year: weekYear })}>
      {sameYear ? t("calendar.header.week", { week }) : t("calendar.header.weekOfYear", { week, year: weekYear })}
    </span>
  );
}

export function DayNumberLabel({ date }: { date: string }) {
  const { t } = useTranslation();
  const { day, daysInYear } = dayOfYear(date);
  const full = t("calendar.header.dayTitle", { day, total: daysInYear });
  return (
    <span title={full}>
      <span aria-hidden>{t("calendar.header.day", { day })}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}
