// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-080. Duplicate-title warning (FR-CAL-16, U#2, D-06, D-69): another active
// event the user can see (own and shared calendars) with the same title — trimmed, Unicode-normalised, case-insensitive,
// accents kept. An empty title ("(No title)") never matches; deleted events never count; a series counts once.
import { occurrences } from "@/atoms/calendar/recurrence";

import { addDays } from "./datetime";
import { exceptionsOf } from "./dayView";
import { NO_TITLE } from "./eventForm";
import { startDayOf } from "./overdue";

type Row = Record<string, unknown>;

/** The comparable form of a title; "" for an empty one. */
export function titleKey(title: unknown): string {
  if (typeof title !== "string") return "";
  const trimmed = title.trim();
  return trimmed === "" || trimmed === NO_TITLE ? "" : trimmed.normalize("NFC").toLocaleLowerCase();
}

/** Active events with the same title, leaving out the ids in `exclude` (the event itself, a copied series). */
export function findDuplicates(rows: readonly Row[], title: string, exclude: readonly string[] = []): Row[] {
  const key = titleKey(title);
  if (key === "") return [];
  return rows.filter(
    (row) =>
      row.kind === "event" && !row.deleted_at && !exclude.includes(String(row.id)) && titleKey(row.title) === key,
  );
}

/** The day to show a duplicate on: a one-off event's start day; a series' next occurrence from today (or its start). */
export function dayToShow(row: Row, today: string, viewerTz: string): string | null {
  const start = startDayOf(row, viewerTz);
  const rrule = typeof row.rrule === "string" && row.rrule !== "" ? row.rrule : null;
  if (start === null || rrule === null || start >= today) return start;
  try {
    const next = occurrences({
      start_date: String(row.start_date),
      rrule,
      exceptions: exceptionsOf(row),
      from: today,
      to: addDays(today, 366),
    });
    return next[0] ?? start;
  } catch {
    return start;
  }
}
