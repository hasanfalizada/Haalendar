// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Card changes (FR-KAN-03, D-92) through the local store and outbox
// (offline too), each with a notification and one undo step: create from "+ Add card" (undone by a soft delete, redone
// by a restore), the editor's Save — the changed fields and the checklist changes as one write —, and delete (soft,
// with its attachments, checklist items and labels; undone by a restore — the trash restores it too). Updates are
// undone by sending the previous values back with the new ones as the base, so a change made meanwhile elsewhere
// becomes a conflict. Checklist undo kinds are those of the notes (noteWrites).
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import type { ChecklistChanges } from "@/lib/checklist";
import { type UndoStep, batchStep, newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

import "@/components/todo/noteWrites";

type Row = Record<string, unknown>;

interface CardRef {
  user: string;
  id: string;
}

interface CardEdit extends CardRef {
  before: Row;
  after: Row;
}

const target = (id: string) => ({ entity_type: "item" as const, entity_id: id });
const itemTarget = (id: string) => ({ entity_type: "checklist_item" as const, entity_id: id });

registerUndo<CardRef>("card.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<CardEdit>("card.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: before }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: after }),
  }),
});

registerUndo<CardRef>("card.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

const titleOf = (row: Row) => (typeof row.title === "string" ? row.title : "");

export interface NewCard {
  boardId: string;
  columnId: string;
  title: string;
  position: string;
  color: string;
}

/** "+ Add card": a card with its title at the end of the column. */
export async function createCard(user: string, card: NewCard): Promise<boolean> {
  const id = uuidv7();
  const values = { title: card.title };
  const result = await runWrite({
    name: "card_create",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "create",
        data: {
          kind: "card",
          container_kind: "board",
          container_id: card.boardId,
          column_id: card.columnId,
          title: card.title,
          position: card.position,
          color: card.color,
          priority: "medium",
        },
      }),
    // A repeat would make a second card.
    retry: false,
    success: i18n.t("kanban.cards.done.create", values),
    undo: () => newStep("card.create", { key: "undo.labels.cardCreated", values }, { user, id }),
  });
  return result.ok;
}

const NO_CHANGES: ChecklistChanges = { create: [], update: [], remove: [] };

/** The editor's Save: the changed fields of the card (`data`) and its checklist changes — one write, one undo step. */
export async function saveCard(
  user: string,
  row: Row,
  data: Row,
  items: ChecklistChanges = NO_CHANGES,
): Promise<boolean> {
  const id = String(row.id);
  const fields = Object.keys(data).length > 0;
  const count = items.create.length + items.update.length + items.remove.length;
  if (!fields && count === 0) return true;
  const values = { title: titleOf({ ...row, ...data }) };
  const base = Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null]));
  const label = { key: "undo.labels.cardChanged", values };
  const result = await runWrite({
    name: "card_edit",
    run: async () => {
      let written: { data: unknown } = { data: true };
      if (fields) {
        const version = typeof row.version === "number" ? { base_version: row.version } : {};
        written = await mutate(user, { ...target(id), op: "update", ...version, base, data });
      }
      for (const entry of items.create) await mutate(user, { ...itemTarget(entry.id), op: "create", data: entry.data });
      for (const entry of items.update) {
        await mutate(user, { ...itemTarget(entry.id), op: "update", base: entry.base, data: entry.data });
      }
      for (const removed of items.remove) await mutate(user, { ...itemTarget(removed), op: "delete" });
      return written;
    },
    success: i18n.t("kanban.cards.done.edit", values),
    undo: () => {
      const steps: UndoStep[] = [
        ...(fields ? [newStep("card.update", label, { user, id, before: base, after: data })] : []),
        ...items.create.map((entry) => newStep("checklist.create", label, { user, id: entry.id })),
        ...items.update.map((entry) =>
          newStep("checklist.update", label, { user, id: entry.id, before: entry.base, after: entry.data }),
        ),
        ...items.remove.map((removed) => newStep("checklist.delete", label, { user, id: removed })),
      ];
      return steps.length === 1 && steps[0] ? steps[0] : batchStep(label, steps);
    },
  });
  return result.ok;
}

export async function deleteCard(user: string, row: Row): Promise<boolean> {
  const id = String(row.id);
  const values = { title: titleOf(row) };
  const result = await runWrite({
    name: "card_delete",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "delete",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
      }),
    success: i18n.t("kanban.cards.done.delete", values),
    undo: () => newStep("card.delete", { key: "undo.labels.cardDeleted", values }, { user, id }),
  });
  return result.ok;
}
