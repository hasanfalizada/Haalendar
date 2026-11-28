// +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (D-125, stage 2). What the "Convert to…" dialog says
// before the server converts an item in place: the kinds it can become (only the owner's own items become notes),
// why it cannot be converted at all (a repeating event, someone else's note) and, from the rows on this device, what
// changes or is taken off — the same rules as the server (planning/convert.py): the checklist turns into a Markdown
// list in an event's description, an event's place into the first line of the description, a title over 150
// characters is cut for an event; labels without one of the same name where the item goes (case ignored), every label
// into an event; a card's assignees and comments; the user's own reminders of the other form (a note's is a date and
// time, an event's and a card's count from the start or due date). The server decides; this only tells.
import { TITLE_MAX } from "./eventForm";

type Row = Record<string, unknown>;

export type ItemKind = "card" | "event" | "note";

export const KINDS: readonly ItemKind[] = ["event", "note", "card"];

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The kinds the item can become: the other two, a note only for the owner's own item. */
export function targetsOf(row: Row, user: string): ItemKind[] {
  return KINDS.filter((kind) => kind !== row.kind && (kind !== "note" || row.owner_id === user));
}

export type Refusal = "repeating" | "notOwner";

/** Why the item cannot be converted at all, or null. */
export function refusalOf(row: Row, user: string): Refusal | null {
  if (row.kind === "event" && text(row.rrule) !== "") return "repeating";
  if (row.kind === "note" && row.owner_id !== user) return "notOwner";
  return null;
}

/** One line of "What changes" (i18n key under "convert.changes."). */
export type ChangeKey = "checklist" | "location" | "titleCut" | "labels" | "assignees" | "comments" | "reminders";

export interface Change {
  key: ChangeKey;
  values: Record<string, string | number>;
}

export interface ChangeRows {
  checklist: readonly Row[];
  itemLabels: readonly Row[];
  labels: readonly Row[];
  assignees: readonly Row[];
  comments: readonly Row[];
  reminders: readonly Row[];
}

const live = (rows: readonly Row[], itemId: string) => rows.filter((row) => row.item_id === itemId && !row.deleted_at);

/**
 * What converting `row` to `target` changes or takes off. `place` is the board a card goes to (its labels are the ones
 * kept); a note keeps the user's own labels of the same name.
 */
export function changesOf(row: Row, target: ItemKind, user: string, rows: ChangeRows, place?: string): Change[] {
  const id = String(row.id);
  const changes: Change[] = [];
  const checklist = live(rows.checklist, id);
  if (target === "event" && checklist.length > 0) {
    changes.push({ key: "checklist", values: { count: checklist.length } });
  }
  if (row.kind === "event" && text(row.location).trim() !== "") {
    changes.push({ key: "location", values: { place: text(row.location).trim() } });
  }
  if (target === "event" && text(row.title).length > TITLE_MAX) {
    changes.push({ key: "titleCut", values: { count: TITLE_MAX } });
  }
  const labelsById = new Map(rows.labels.filter((label) => !label.deleted_at).map((label) => [label.id, label]));
  const names = live(rows.itemLabels, id)
    .map((on) => text(labelsById.get(on.label_id)?.name))
    .filter(Boolean);
  const there = new Set(
    rows.labels
      .filter(
        (label) =>
          !label.deleted_at &&
          (target === "card"
            ? label.board_id === place
            : target === "note" && !label.board_id && label.container_id === user),
      )
      .map((label) => text(label.name).toLowerCase()),
  );
  const taken = names.filter((name) => !there.has(name.toLowerCase())).sort((a, b) => a.localeCompare(b));
  if (taken.length > 0) changes.push({ key: "labels", values: { names: taken.join(", "), count: taken.length } });
  if (row.kind === "card") {
    const assignees = live(rows.assignees, id).length;
    if (assignees > 0) changes.push({ key: "assignees", values: { count: assignees } });
    const comments = live(rows.comments, id).length;
    if (comments > 0) changes.push({ key: "comments", values: { count: comments } });
  }
  // A note's reminders are a date and time; an event's and a card's count from its start or due date.
  const atForm = (reminder: Row) => typeof reminder.remind_at === "string" && reminder.remind_at !== "";
  if ((row.kind === "note") !== (target === "note")) {
    const other = live(rows.reminders, id).filter(
      (reminder) => reminder.owner_id === user && atForm(reminder) === (row.kind === "note"),
    ).length;
    if (other > 0) changes.push({ key: "reminders", values: { count: other } });
  }
  return changes;
}

/** The kind of item an audit record of a conversion made it, or null when the record is not one. */
export function convertedTo(after: Row | null | undefined): ItemKind | null {
  const kind = after?.kind;
  return kind === "card" || kind === "event" || kind === "note" ? kind : null;
}
