// +++===+++ 2026-11-25 09:20 +04 — Hasan Alizada — HAAL-114 (D-123). What an audit record of an item's history means, in
// words: the item and what belongs to it (checklist, labels, assignees, images, links, comments, single dates of a
// series). A record holds the whole row only when it was created, otherwise just the changed fields, so names come
// from the rows on this device (they keep deleted rows): the column a card went to, the label, the person, the
// checklist item, the linked item, the image. A name the device does not know reads "a checklist item" and the like.
// Left out: records that only repeat another one (the details of an item when it was created), a comment's own
// writing and changes (the comment is shown itself) and reorders that change nothing but the order.
import type { AuditRecord } from "@/api/generated/types.gen";

import { convertedTo } from "./convert";

type Row = Record<string, unknown>;

export type ItemKind = "card" | "event" | "note";

export interface ActivityNames {
  columns: ReadonlyMap<string, string>;
  labels: ReadonlyMap<string, string>;
  users: ReadonlyMap<string, string>;
  items: ReadonlyMap<string, string>;
  /** Rows by id of the tables whose records carry only an id: checklist items, labels on items, assignees, links, images. */
  rows: ReadonlyMap<string, Row>;
}

export interface ActivityLine {
  /** i18n key under "activity." */
  key: string;
  values: Record<string, string>;
  /** Changed fields (i18n keys under "activity.fields."), for "changed …". */
  fields?: string[];
}

const DETAIL_TABLES = new Set(["item", "card", "event", "note"]);
// Columns that are bookkeeping or follow from others: never named as a change.
const QUIET = new Set([
  "id",
  "kind",
  "owner_id",
  "container_kind",
  "container_id",
  "board_id",
  "position",
  "legacy_id",
  "ics_uid",
  "start_utc",
  "end_utc",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "deleted_at",
  "delete_batch_id",
  "version",
  "sync_seq",
  "sync_xid",
  "checked_at",
  "edited_at",
]);
export const NAMED_FIELDS = [
  "title",
  "body",
  "color",
  "priority",
  "due_date",
  "due_time",
  "location",
  "all_day",
  "start_date",
  "start_time",
  "end_date",
  "end_time",
  "tzid",
  "rrule",
  "pinned",
  "archived_at",
  "is_checklist",
] as const;
const NAMED: ReadonlySet<string> = new Set(NAMED_FIELDS);

const text = (value: unknown) => (typeof value === "string" ? value : "");

function field(record: AuditRecord, name: string): unknown {
  return record.after?.[name] ?? record.before?.[name];
}

/** A value of the record, or else of the row on this device. */
function known(record: AuditRecord, names: ActivityNames, name: string): string {
  return text(field(record, name)) || text(names.rows.get(record.entity_id)?.[name]);
}

function nameIn(map: ReadonlyMap<string, string>, id: string): string {
  return id ? (map.get(id) ?? "") : "";
}

/** Added again, taken off again: a restore counts as the add, a delete as the removal. */
const adds = (action: string) => action === "create" || action === "restore";

/** The line of one record; null: not shown. */
export function activityLine(
  record: AuditRecord,
  item: { id: string; kind: ItemKind },
  names: ActivityNames,
): ActivityLine | null {
  const { kind } = item;
  const { action, entity_type: type } = record;
  if (DETAIL_TABLES.has(type)) {
    // +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (D-125). A conversion changes the item's kind (and its
    // place with it, so it is recorded as a move).
    const converted = type === "item" && action !== "create" ? convertedTo(record.after) : null;
    if (converted) return { key: `converted.${converted}`, values: {} };
    // A converted item was created as another kind: its creation record says which.
    if (action === "create")
      return type === "item" ? { key: `created.${convertedTo(record.after) ?? kind}`, values: {} } : null;
    if (action === "delete") return type === "item" ? { key: `deleted.${kind}`, values: {} } : null;
    if (action === "restore") return type === "item" ? { key: `restored.${kind}`, values: {} } : null;
    if (action === "move") {
      const column = text(record.after?.column_id);
      if (column) {
        const name = nameIn(names.columns, column);
        return name ? { key: "movedTo", values: { column: name } } : { key: "moved", values: {} };
      }
      if (record.after?.container_id !== undefined) return { key: `movedContainer.${kind}`, values: {} };
      // Only the order changed: a card's place in its column still counts, a note's or an event's does not.
      return kind === "card" ? { key: "moved", values: {} } : null;
    }
    const fields = Object.keys(record.after ?? {}).filter((name) => !QUIET.has(name));
    if (fields.length === 0) return null;
    return { key: "changed", values: {}, fields: fields.map((name) => (NAMED.has(name) ? name : "other")) };
  }
  switch (type) {
    case "checklist_item": {
      const item = known(record, names, "text");
      const values = { text: item };
      const suffix = item ? "" : "Unnamed";
      if (adds(action)) return { key: `checklistAdded${suffix}`, values };
      if (action === "delete") return { key: `checklistRemoved${suffix}`, values };
      if (action === "move") return null;
      if (record.after && "checked" in record.after)
        return { key: `${record.after.checked ? "checklistChecked" : "checklistUnchecked"}${suffix}`, values };
      if (record.after && "text" in record.after) return { key: "checklistRenamed", values: { text: item } };
      return null;
    }
    case "item_label": {
      const label = nameIn(names.labels, known(record, names, "label_id"));
      const suffix = label ? "" : "Unnamed";
      if (adds(action)) return { key: `labelAdded${suffix}`, values: { name: label } };
      if (action === "delete") return { key: `labelRemoved${suffix}`, values: { name: label } };
      return null;
    }
    case "card_assignee": {
      const person = nameIn(names.users, known(record, names, "user_id"));
      const suffix = person ? "" : "Unnamed";
      if (adds(action)) return { key: `assigned${suffix}`, values: { name: person } };
      if (action === "delete") return { key: `unassigned${suffix}`, values: { name: person } };
      return null;
    }
    case "attachment": {
      const name = known(record, names, "file_name");
      const suffix = name ? "" : "Unnamed";
      if (adds(action)) return { key: `imageAdded${suffix}`, values: { name } };
      if (action === "delete") return { key: `imageRemoved${suffix}`, values: { name } };
      return null;
    }
    case "link": {
      return linkLine(record, item.id, names, action);
    }
    case "comment":
      if (action === "delete") return { key: "commentDeleted", values: {} };
      if (action === "restore") return { key: "commentRestored", values: {} };
      return null; // written or changed: the comment itself is in the feed
    case "recurrence_exception": {
      const date = known(record, names, "occurrence_date");
      if (adds(action))
        return { key: known(record, names, "kind") === "overridden" ? "dateChanged" : "dateRemoved", values: { date } };
      if (action === "delete") return { key: date ? "dateBack" : "dateBackUnnamed", values: { date } };
      return null;
    }
    default:
      return null;
  }
}

function linkLine(record: AuditRecord, itemId: string, names: ActivityNames, action: string): ActivityLine | null {
  const from = known(record, names, "from_item_id");
  const title = nameIn(names.items, from === itemId ? known(record, names, "to_item_id") : from);
  const suffix = title ? "" : "Unnamed";
  if (adds(action)) return { key: `linked${suffix}`, values: { title } };
  if (action === "delete") return { key: `unlinked${suffix}`, values: { title } };
  return null;
}
