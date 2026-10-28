// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Calendar module placeholder; day view arrives in HAAL-060.
// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. The day view of `?date=YYYY-MM-DD` (default: today in the profile
// time zone); a malformed date falls back to today.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. `?view=day|week`; without it the view last chosen on this device.
import { createFileRoute } from "@tanstack/react-router";

import { DayView } from "@/components/calendar/DayView";
import { type CalendarViewKind, storedView } from "@/lib/calendarView";
import { todayIn, useDisplayTimeZone } from "@/lib/datetime";

interface CalendarSearch {
  date?: string;
  view?: CalendarViewKind;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" naming a real day (2026-02-30 is not one). */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(value);
}

function CalendarPage() {
  const { date, view } = Route.useSearch();
  const viewerTz = useDisplayTimeZone();
  return <DayView date={date ?? todayIn(viewerTz)} view={view ?? storedView()} />;
}

export const Route = createFileRoute("/_app/calendar")({
  // An explicit undefined: the router merges the parent's raw search params, so a dropped key would come back.
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    date: typeof search.date === "string" && isRealDate(search.date) ? search.date : undefined,
    view: search.view === "day" || search.view === "week" ? search.view : undefined,
  }),
  component: CalendarPage,
});
