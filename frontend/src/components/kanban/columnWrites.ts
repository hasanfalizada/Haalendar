// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. Changes of a board's columns (FR-KAN-02, D-91): create, rename, WIP
// limit, move, archive / unarchive and delete go through the local store and outbox (offline too) with a notification
// and an undo step, like boards. Archiving sends this device's time — the server keeps its own.
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

interface ColumnRef {
  user: string;
  id: string;
}

interface ColumnEdit extends ColumnRef {
  before: Row;
  after: Row;
}

const target = (id: string) => ({ entity_type: "board_column" as const, entity_id: id });

registerUndo<ColumnRef>("column.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<ColumnRef>("column.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

// The archive time is sent anew each time ("now"), never an old one.
const fresh = (values: Row): Row =>
  values.archived_at ? { ...values, archived_at: new Date().toISOString() } : values;

registerUndo<ColumnEdit>("column.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: fresh(before) }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: fresh(after) }),
  }),
});

/** The mutation that creates a column (also used for the columns a new board starts with). */
export function columnCreate(id: string, boardId: string, name: string, position: string) {
  return { ...target(id), op: "create" as const, data: { board_id: boardId, name, position } };
}

export async function createColumn(user: string, boardId: string, name: string, position: string): Promise<boolean> {
  const id = uuidv7();
  const values = { name };
  const result = await runWrite({
    name: "column_create",
    run: () => mutate(user, columnCreate(id, boardId, name, position)),
    success: i18n.t("kanban.columns.done.create", values),
    undo: () => newStep("column.create", { key: "undo.labels.columnCreated", values }, { user, id }),
  });
  return result.ok;
}

export type ColumnChange = "rename" | "wip" | "move" | "archive" | "unarchive";

/** An update of the column's own fields; `data` holds the new values. */
export async function updateColumn(user: string, row: Row, change: ColumnChange, data: Row): Promise<boolean> {
  const id = String(row.id);
  const base = Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null]));
  const values = { name: change === "rename" ? String(data.name) : String(row.name) };
  const result = await runWrite({
    name: `column_${change}`,
    run: () =>
      mutate(user, {
        ...target(id),
        op: "update",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
        base,
        data,
      }),
    success: i18n.t(`kanban.columns.done.${change}`, values),
    undo: () =>
      newStep("column.update", { key: "undo.labels.columnChanged", values }, { user, id, before: base, after: data }),
  });
  return result.ok;
}

export async function deleteColumn(user: string, row: Row): Promise<boolean> {
  const id = String(row.id);
  const values = { name: String(row.name) };
  const result = await runWrite({
    name: "column_delete",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "delete",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
      }),
    success: i18n.t("kanban.columns.done.delete", values),
    undo: () => newStep("column.delete", { key: "undo.labels.columnDeleted", values }, { user, id }),
  });
  return result.ok;
}
