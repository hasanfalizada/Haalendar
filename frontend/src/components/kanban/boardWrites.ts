// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. Changes of the user's boards (FR-KAN-01, D-90): create, rename,
// archive / unarchive and delete go through the local store and outbox (offline too) with a notification and an undo
// step, like calendars. Archiving sends this device's time — the server keeps its own; undoing an unarchive sends the
// time again.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. A new board starts with its columns (To do, In progress, Done; D-91),
// written with it in one undo step: undoing deletes the board, which takes its columns along.
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { startPositions } from "@/lib/columns";
import { mutate } from "@/sync";

import { columnCreate } from "./columnWrites";

type Row = Record<string, unknown>;

interface BoardRef {
  user: string;
  id: string;
}

interface BoardEdit extends BoardRef {
  before: Row;
  after: Row;
}

const target = (id: string) => ({ entity_type: "board" as const, entity_id: id });

registerUndo<BoardRef>("board.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<BoardRef>("board.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

// The archive time is sent anew each time ("now"), never an old one.
const fresh = (values: Row): Row =>
  values.archived_at ? { ...values, archived_at: new Date().toISOString() } : values;

registerUndo<BoardEdit>("board.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: fresh(before) }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: fresh(after) }),
  }),
});

const versionOf = (row: Row) => (typeof row.version === "number" ? { base_version: row.version } : {});

/** Creates a board with the given columns; its id when written, else null. */
export async function createBoard(
  user: string,
  name: string,
  position: string,
  columns: readonly string[] = [],
): Promise<string | null> {
  const id = uuidv7();
  const values = { name };
  const result = await runWrite({
    name: "board_create",
    run: async () => {
      const written = await mutate(user, { ...target(id), op: "create", data: { name, position } });
      const positions = startPositions(columns.length);
      for (const [index, column] of columns.entries()) {
        await mutate(user, columnCreate(uuidv7(), id, column, positions[index] ?? "V"));
      }
      return written;
    },
    success: i18n.t("kanban.done.create", values),
    undo: () => newStep("board.create", { key: "undo.labels.boardCreated", values }, { user, id }),
  });
  return result.ok ? id : null;
}

export type BoardChange = "rename" | "archive" | "unarchive";

/** An update of the board's own fields; `data` holds the new values. */
export async function updateBoard(user: string, row: Row, change: BoardChange, data: Row): Promise<boolean> {
  const id = String(row.id);
  const base = Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null]));
  const values = { name: change === "rename" ? String(data.name) : String(row.name) };
  const result = await runWrite({
    name: `board_${change}`,
    run: () => mutate(user, { ...target(id), op: "update", ...versionOf(row), base, data }),
    success: i18n.t(`kanban.done.${change}`, values),
    undo: () =>
      newStep("board.update", { key: "undo.labels.boardChanged", values }, { user, id, before: base, after: data }),
  });
  return result.ok;
}

export async function deleteBoard(user: string, row: Row): Promise<boolean> {
  const id = String(row.id);
  const values = { name: String(row.name) };
  const result = await runWrite({
    name: "board_delete",
    run: () => mutate(user, { ...target(id), op: "delete", ...versionOf(row) }),
    success: i18n.t("kanban.done.delete", values),
    undo: () => newStep("board.delete", { key: "undo.labels.boardDeleted", values }, { user, id }),
  });
  return result.ok;
}
