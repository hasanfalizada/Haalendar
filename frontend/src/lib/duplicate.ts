// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. Duplicate an event to another date (FR-CAL-34, C-10, D-84): what the
// copy of an event shown on a date is.
// - a one-off event: all its fields in the same calendar and zone, its start on the chosen date and its end moved by
//   as many days (times as they are, so a multi-day event stays as long);
// - an occurrence of a series: that occurrence as a one-off event on the chosen date (the series' fields, no repeat) —
//   like "edit only this occurrence" (D-67); the series stays as it is.
// The copy names its source, so the server gives it the source's attachments (new rows, the same files).
import { addDays, daysBetween } from "@/lib/datetime";
import { eventData, formFromRow } from "@/lib/eventForm";

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** The date the shown occurrence starts on: a one-off event's start, an occurrence's own date. */
export function copiedStart(row: Row, occurrence: string): string {
  return text(row.rrule) ? occurrence : (text(row.start_date) ?? occurrence);
}

/** The date offered for the copy: the day after the copied start. */
export function defaultTarget(row: Row, occurrence: string): string {
  return addDays(copiedStart(row, occurrence), 1);
}

/** The create data of the copy of `row` shown on `occurrence`, starting on `target` ("YYYY-MM-DD"). */
export function duplicateData(row: Row, occurrence: string, target: string): Row {
  const series = text(row.rrule) !== null;
  const form = formFromRow(row, series ? occurrence : undefined);
  const days = daysBetween(form.start_date, target);
  return {
    kind: "event",
    container_kind: "calendar",
    container_id: row.container_id,
    ...(text(row.tzid) ? { tzid: row.tzid } : {}),
    ...eventData({ ...form, start_date: target, end_date: addDays(form.end_date, days) }),
    copy_attachments_from: String(row.id),
  };
}
