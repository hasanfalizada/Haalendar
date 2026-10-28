// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. The text of a reminder notification (D-79) for the center and the
// toast: "Reminder: Dentist — Today, 11:00–12:00" ("Tomorrow", otherwise the date; all-day events without times) in
// the reader's zone and 12/24-hour setting, "(sent late)" when the server was behind; and where it leads: the day in
// the day view with the event's card.
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { addDays, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { clockText, dayLabel } from "@/lib/dayView";
import { reminderWhen } from "@/lib/reminders";

type Payload = Record<string, unknown>;

export function useReminderText(): (payload: Payload) => string {
  const { t, i18n } = useTranslation();
  const viewerTz = useDisplayTimeZone();
  const { time_format: timeFormat } = useSettings();
  return (payload) => {
    const title = typeof payload.title === "string" && payload.title ? payload.title : t("notifications.unnamed");
    const when = reminderWhen(payload, viewerTz);
    let text = "";
    if (when) {
      const today = todayIn(viewerTz);
      const day =
        when.day === today
          ? t("calendar.header.today")
          : when.day === addDays(today, 1)
            ? t("calendar.agenda.tomorrow")
            : dayLabel(when.day, i18n.language);
      const clock = (hhmm: string) => clockText(hhmm, i18n.language, timeFormat);
      const time = when.start ? (when.end ? `${clock(when.start)}–${clock(when.end)}` : clock(when.start)) : null;
      text = time ? `${day}, ${time}` : day;
    }
    return t(payload.late === true ? "notifications.reminderLate" : "notifications.reminder", { title, when: text });
  };
}

/** The calendar search that shows the event of a reminder; null without an event. */
export function reminderTarget(
  payload: Payload,
  viewerTz: string,
): { date: string; view: "day"; event: string } | null {
  const when = reminderWhen(payload, viewerTz);
  const event = typeof payload.item_id === "string" ? payload.item_id : null;
  return when && event ? { date: when.day, view: "day", event } : null;
}
