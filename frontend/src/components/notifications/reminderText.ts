// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. The text of a reminder notification (D-79) for the center and the
// toast: "Reminder: Dentist — Today, 11:00–12:00" ("Tomorrow", otherwise the date; all-day events without times) in
// the reader's zone and 12/24-hour setting, "(sent late)" when the server was behind; and where it leads: the day in
// the day view with the event's card.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. A note's reminder (D-89): "Reminder: Shopping — Today, 09:00" (the time
// it was set for) and it opens the note on the To-Do page.
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { addDays, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { clockText, dayLabel } from "@/lib/dayView";
import { atLabel, reminderWhen } from "@/lib/reminders";

type Payload = Record<string, unknown>;

export function useReminderText(): (payload: Payload) => string {
  const { t, i18n } = useTranslation();
  const viewerTz = useDisplayTimeZone();
  const { time_format: timeFormat } = useSettings();
  return (payload) => {
    const title = typeof payload.title === "string" && payload.title ? payload.title : t("notifications.unnamed");
    if (payload.kind === "note") {
      const at = typeof payload.fire_at === "string" ? atLabel(payload.fire_at, viewerTz, timeFormat, Date.now()) : "";
      const name = typeof payload.title === "string" && payload.title ? payload.title : t("todo.untitled");
      return t(payload.late === true ? "notifications.reminderLate" : "notifications.reminder", {
        title: name,
        when: at,
      });
    }
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

export type ReminderTarget =
  { to: "/calendar"; search: { date: string; view: "day"; event: string } } | { to: "/todo"; search: { note: string } };

/** Where a reminder leads: the event's day with its card, or the note on the To-Do page; null without its item. */
export function reminderTarget(payload: Payload, viewerTz: string): ReminderTarget | null {
  const item = typeof payload.item_id === "string" ? payload.item_id : null;
  if (!item) return null;
  if (payload.kind === "note") return { to: "/todo", search: { note: item } };
  const when = reminderWhen(payload, viewerTz);
  return when ? { to: "/calendar", search: { date: when.day, view: "day", event: item } } : null;
}
