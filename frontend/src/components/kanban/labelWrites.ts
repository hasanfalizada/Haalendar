// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112 (stage 3). Board labels (FR-KAN-03, D-92) through the local store and
// outbox (offline too), each with a notification and one undo step: create, rename / recolour and delete (it comes off
// every card in the same batch; undo brings it back with them). Labels on a card are written with the card editor's
// Save (cardWrites); their undo kinds live here.
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

interface LabelRef {
  user: string;
  id: string;
}

interface LabelEdit extends LabelRef {
  before: Row;
  after: Row;
}

const target = (id: string) => ({ entity_type: "label" as const, entity_id: id });
const onTarget = (id: string) => ({ entity_type: "item_label" as const, entity_id: id });

registerUndo<LabelRef>("label.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<LabelEdit>("label.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: before }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: after }),
  }),
});

registerUndo<LabelRef>("label.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

registerUndo<LabelRef>("itemLabel.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...onTarget(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...onTarget(id), op: "restore" }) }),
});

registerUndo<LabelRef>("itemLabel.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...onTarget(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...onTarget(id), op: "delete" }) }),
});

/** The writes that put labels on a card and take them off (the card editor's Save). */
export interface LabelChanges {
  add: { id: string; label_id: string }[];
  /** item_label row ids. */
  remove: string[];
}

/**
 * What to put on and take off: only labels still on the board count — a label deleted from the board came off its
 * cards with it (its undo puts it back), so Save leaves those rows alone.
 */
export function labelChanges(
  cardId: string,
  rows: readonly Row[],
  chosen: readonly string[],
  boardLabels: ReadonlySet<string>,
): LabelChanges {
  const live = rows.filter((row) => row.item_id === cardId && !row.deleted_at && boardLabels.has(String(row.label_id)));
  const on = new Set(live.map((row) => String(row.label_id)));
  return {
    add: chosen
      .filter((labelId) => !on.has(labelId) && boardLabels.has(labelId))
      .map((labelId) => ({ id: uuidv7(), label_id: labelId })),
    remove: live.filter((row) => !chosen.includes(String(row.label_id))).map((row) => String(row.id)),
  };
}

/** Creates a label of the board; its id when written, else null. */
export async function createLabel(user: string, boardId: string, name: string, color: string): Promise<string | null> {
  const id = uuidv7();
  const values = { name };
  const result = await runWrite({
    name: "label_create",
    run: () => mutate(user, { ...target(id), op: "create", data: { board_id: boardId, name, color } }),
    success: i18n.t("kanban.labels.done.create", values),
    undo: () => newStep("label.create", { key: "undo.labels.labelCreated", values }, { user, id }),
  });
  return result.ok ? id : null;
}

/** New name and / or colour of a label (`data` holds the changed values only). */
export async function updateLabel(user: string, row: Row, data: Row): Promise<boolean> {
  const id = String(row.id);
  const base = Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null]));
  const values = { name: String(data.name ?? row.name) };
  const result = await runWrite({
    name: "label_edit",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "update",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
        base,
        data,
      }),
    success: i18n.t("kanban.labels.done.edit", values),
    undo: () =>
      newStep("label.update", { key: "undo.labels.labelChanged", values }, { user, id, before: base, after: data }),
  });
  return result.ok;
}

export async function deleteLabel(user: string, row: Row): Promise<boolean> {
  const id = String(row.id);
  const values = { name: String(row.name) };
  const result = await runWrite({
    name: "label_delete",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "delete",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
      }),
    success: i18n.t("kanban.labels.done.delete", values),
    undo: () => newStep("label.delete", { key: "undo.labels.labelDeleted", values }, { user, id }),
  });
  return result.ok;
}
