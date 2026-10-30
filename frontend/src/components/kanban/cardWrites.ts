// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Card changes (FR-KAN-03, D-92) through the local store and outbox
// (offline too), each with a notification and one undo step: create from "+ Add card" (undone by a soft delete, redone
// by a restore), the editor's Save — the changed fields and the checklist changes as one write —, and delete (soft,
// with its attachments, checklist items and labels; undone by a restore — the trash restores it too). Updates are
// undone by sending the previous values back with the new ones as the base, so a change made meanwhile elsewhere
// becomes a conflict. Checklist undo kinds are those of the notes (noteWrites).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112 (stage 3). Save writes the labels put on and taken off the card too.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. A move (drag and drop, Alt+arrows) writes the column and position
// together (they merge as a pair, D-93); undone by moving it back.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Save writes the user's reminders of the card too (D-94).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. And its assignees (D-97).
import { runWrite } from "@/api/write";
import type { ReminderChanges } from "@/components/calendar/reminderWrites";
import i18n from "@/i18n";
import type { ChecklistChanges } from "@/lib/checklist";
import { type UndoStep, batchStep, newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

import "@/components/todo/noteWrites";

import { type AssigneeChanges, assigneeTarget } from "./assigneeWrites";
import type { LabelChanges } from "./labelWrites";

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
const labelTarget = (id: string) => ({ entity_type: "item_label" as const, entity_id: id });

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
export async function createCard(user: string, card: NewCard, hidden = false): Promise<boolean> {
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
    // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. Hidden by the board filters: the message says so (D-96).
    success: i18n.t(hidden ? "kanban.cards.done.createHidden" : "kanban.cards.done.create", values),
    undo: () => newStep("card.create", { key: "undo.labels.cardCreated", values }, { user, id }),
  });
  return result.ok;
}

const NO_CHANGES: ChecklistChanges = { create: [], update: [], remove: [] };
const NO_LABELS: LabelChanges = { add: [], remove: [] };
const NO_ASSIGNEES: AssigneeChanges = { add: [], remove: [] };

/**
 * The editor's Save: the changed fields of the card (`data`), its checklist, labels and the user's reminders — one
 * write, one undo step.
 */
export async function saveCard(
  user: string,
  row: Row,
  data: Row,
  items: ChecklistChanges = NO_CHANGES,
  labels: LabelChanges = NO_LABELS,
  reminders?: ReminderChanges,
  assignees: AssigneeChanges = NO_ASSIGNEES,
): Promise<boolean> {
  const id = String(row.id);
  const fields = Object.keys(data).length > 0;
  const count =
    items.create.length +
    items.update.length +
    items.remove.length +
    labels.add.length +
    labels.remove.length +
    assignees.add.length +
    assignees.remove.length +
    (reminders?.count ?? 0);
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
      for (const added of labels.add) {
        await mutate(user, { ...labelTarget(added.id), op: "create", data: { item_id: id, label_id: added.label_id } });
      }
      for (const removed of labels.remove) await mutate(user, { ...labelTarget(removed), op: "delete" });
      for (const added of assignees.add) {
        await mutate(user, {
          ...assigneeTarget(added.id),
          op: "create",
          data: { item_id: id, user_id: added.user_id },
        });
      }
      for (const removed of assignees.remove) await mutate(user, { ...assigneeTarget(removed), op: "delete" });
      await reminders?.run();
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
        ...labels.add.map((added) => newStep("itemLabel.create", label, { user, id: added.id })),
        ...labels.remove.map((removed) => newStep("itemLabel.delete", label, { user, id: removed })),
        ...assignees.add.map((added) => newStep("assignee.create", label, { user, id: added.id })),
        ...assignees.remove.map((removed) => newStep("assignee.delete", label, { user, id: removed })),
        ...(reminders?.steps ?? []),
      ];
      return steps.length === 1 && steps[0] ? steps[0] : batchStep(label, steps);
    },
  });
  return result.ok;
}

/** A card moved to `position` in the column `columnId` (the same one or another of its board). */
export async function moveCard(user: string, row: Row, columnId: string, position: string): Promise<boolean> {
  const id = String(row.id);
  const values = { title: titleOf(row) };
  const before = { column_id: row.column_id ?? null, position: row.position ?? null };
  const after = { column_id: columnId, position };
  const result = await runWrite({
    name: "card_move",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "update",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
        base: before,
        data: after,
      }),
    success: i18n.t("kanban.cards.done.move", values),
    undo: () => newStep("card.update", { key: "undo.labels.cardMoved", values }, { user, id, before, after }),
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
