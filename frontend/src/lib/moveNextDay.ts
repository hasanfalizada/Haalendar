// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. Move to next day (FR-CAL-20, U#11, D-73): what moving one event
// shown on a date writes.
// - a one-off event: its start and end dates move by one calendar day; dates and wall-clock times are stored in the
//   event's own zone, so the times stay as they are (also across a daylight-saving change), all-day events included;
// - an occurrence of a series: a one-off copy of that occurrence on the next day (the series' fields, no repeat, same
//   calendar and zone; attachments stay with the series) and the occurrence's date excluded from the series with the
//   copy as its replacement — the same writes as "edit only this occurrence" (D-67).
import { addDays } from "@/lib/datetime";
import { eventData, formFromRow } from "@/lib/eventForm";

type Row = Record<string, unknown>;

export type MovePlan =
  | { kind: "shift"; id: string; version: number | null; base: Row; data: Row }
  | { kind: "occurrence"; series: string; date: string; copy: Row };

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** The writes that move `row`, shown on `occurrence` ("YYYY-MM-DD"), to the next day. */
export function planMove(row: Row, occurrence: string): MovePlan {
  if (text(row.rrule)) {
    return {
      kind: "occurrence",
      series: String(row.id),
      date: occurrence,
      copy: {
        kind: "event",
        container_kind: "calendar",
        container_id: row.container_id,
        ...(text(row.tzid) ? { tzid: row.tzid } : {}),
        ...eventData(formFromRow(row, addDays(occurrence, 1))),
      },
    };
  }
  const start = text(row.start_date) ?? occurrence;
  const end = text(row.end_date);
  return {
    kind: "shift",
    id: String(row.id),
    version: typeof row.version === "number" ? row.version : null,
    base: { start_date: start, ...(end ? { end_date: end } : {}) },
    data: { start_date: addDays(start, 1), ...(end ? { end_date: addDays(end, 1) } : {}) },
  };
}
