// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. The calendar's views (D-75) and the one last chosen on this device.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. Month (D-76).
const VIEW_KEY = "haalendar.calendar.view";

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarViewKind = (typeof CALENDAR_VIEWS)[number];

/** `value` when it names a view. */
export function asView(value: unknown): CalendarViewKind | undefined {
  return CALENDAR_VIEWS.find((view) => view === value);
}

/** The view last chosen on this device (day when none or unreadable). */
export function storedView(): CalendarViewKind {
  try {
    return asView(window.localStorage.getItem(VIEW_KEY)) ?? "day";
  } catch {
    return "day";
  }
}

export function storeView(view: CalendarViewKind): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}
