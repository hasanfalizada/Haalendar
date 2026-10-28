// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. The time of a day entry as the grids show and read it ("10:00–12:00",
// "Until 02:00", "From 22:00", "All day"), in the 12/24-hour setting; taken out of the week view (HAAL-087).
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";

import { type DayEntry, clockText } from "./dayView";

export function useEntryTime(): {
  /** The whole range of the entry on its day. */
  range: (entry: DayEntry) => string;
  /** The start alone, or null for all-day and continuing entries (the month chips). */
  start: (entry: DayEntry) => string | null;
} {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const clock = (hhmm: string) => clockText(hhmm, i18n.language, timeFormat);
  return {
    range: (entry) => {
      if (entry.allDay || entry.start === null || entry.end === null) return t("calendar.day.allDay");
      const [start, end] = [clock(entry.start), clock(entry.end)];
      if (entry.continues && entry.goesOn) return t("calendar.day.allDayContinues");
      if (entry.continues) return t("calendar.day.until", { time: end });
      if (entry.goesOn) return t("calendar.day.from", { time: start });
      return start === end ? start : `${start}–${end}`;
    },
    start: (entry) => (entry.allDay || entry.continues || entry.start === null ? null : clock(entry.start)),
  };
}
