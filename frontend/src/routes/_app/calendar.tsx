// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Calendar module placeholder; day view arrives in HAAL-060.
// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. The day view of `?date=YYYY-MM-DD` (default: today in the profile
// time zone); a malformed date falls back to today.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. `?view=day|week` (HAAL-088: |month, HAAL-089: |agenda); without it the view last chosen on this device.
import { createFileRoute } from "@tanstack/react-router";

import { DayView } from "@/components/calendar/DayView";
import { type CalendarViewKind, asView, storedView } from "@/lib/calendarView";
import { isRealDate, todayIn, useDisplayTimeZone } from "@/lib/datetime";

interface CalendarSearch {
  date?: string;
  view?: CalendarViewKind;
  // +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. An event whose card opens (from a reminder notification).
  event?: string;
  // +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The command palette asks for a new event, with its title.
  new?: "event";
  title?: string;
}

function CalendarPage() {
  const { date, view, event, new: create, title } = Route.useSearch();
  const viewerTz = useDisplayTimeZone();
  return (
    <DayView
      date={date ?? todayIn(viewerTz)}
      view={view ?? storedView()}
      {...(event ? { focusEvent: event } : {})}
      {...(create ? { createEvent: title ?? "" } : {})}
    />
  );
}

export const Route = createFileRoute("/_app/calendar")({
  // An explicit undefined: the router merges the parent's raw search params, so a dropped key would come back.
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    date: typeof search.date === "string" && isRealDate(search.date) ? search.date : undefined,
    view: asView(search.view),
    event: typeof search.event === "string" && /^[0-9a-f-]{36}$/i.test(search.event) ? search.event : undefined,
    new: search.new === "event" ? "event" : undefined,
    title: typeof search.title === "string" ? search.title.slice(0, 500) : undefined,
  }),
  component: CalendarPage,
});
