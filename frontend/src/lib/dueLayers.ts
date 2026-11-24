// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-121. The layers of due dates in the calendar (FR-CAL-24,
// FR-TODO-06, D-122), without React: the due dates of notes and of cards on given days.
// - A note: live, not archived (own or shared with the user — the local rows hold only what the user reads).
// - A card: live, on a live board that is not archived.
// - A due date stands on its date as stored (wall-clock in its owner's zone, D-92 / D-121), never shifted by the
//   viewer's zone; a layer the user hides (`hidden_layers`) gives nothing.
// - The order of a day: the whole-day ones first, then by time, then by title.
type Row = Record<string, unknown>;

export type Layer = "note_due" | "card_due";
export const LAYERS: readonly Layer[] = ["note_due", "card_due"];

export interface DueEntry {
  key: string;
  id: string;
  kind: "note" | "card";
  title: string;
  date: string;
  /** "HH:MM" or null (the whole day). */
  time: string | null;
  row: Row;
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** The due dates of the shown layers on `days`, each day in the order above. */
export function duesOnDays(
  items: readonly Row[],
  boards: readonly Row[],
  days: readonly string[],
  hidden: ReadonlySet<string>,
): Map<string, DueEntry[]> {
  const wanted = new Set(days);
  const byDay = new Map<string, DueEntry[]>(days.map((day) => [day, []]));
  const notes = !hidden.has("note_due");
  const cards = !hidden.has("card_due");
  if (!notes && !cards) return byDay;
  const liveBoards = new Set(
    boards.filter((board) => !board.deleted_at && !board.archived_at).map((board) => String(board.id)),
  );
  for (const row of items) {
    const date = textOf(row.due_date);
    if (row.deleted_at || !DATE.test(date) || !wanted.has(date)) continue;
    let kind: DueEntry["kind"];
    if (row.kind === "note" && notes && !row.archived_at) kind = "note";
    else if (row.kind === "card" && cards && liveBoards.has(String(row.container_id))) kind = "card";
    else continue;
    const time = textOf(row.due_time);
    const id = String(row.id);
    byDay.get(date)?.push({
      key: `due:${id}`,
      id,
      kind,
      title: textOf(row.title),
      date,
      time: TIME.test(time) ? time : null,
      row,
    });
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        Number(a.time !== null) - Number(b.time !== null) ||
        (a.time ?? "").localeCompare(b.time ?? "") ||
        a.title.localeCompare(b.title),
    );
  }
  return byDay;
}
