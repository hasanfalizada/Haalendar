// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. Card assignees (D-97): written with the card editor's Save
// (cardWrites), in its undo step; their undo kinds live here. Only members count: someone no longer a member keeps their
// rows (unshown), so Save leaves those alone.
import { registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

interface AssigneeRef {
  user: string;
  id: string;
}

const target = (id: string) => ({ entity_type: "card_assignee" as const, entity_id: id });

registerUndo<AssigneeRef>("assignee.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<AssigneeRef>("assignee.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

/** The writes that assign people to a card and take them off (the card editor's Save). */
export interface AssigneeChanges {
  add: { id: string; user_id: string }[];
  /** card_assignee row ids. */
  remove: string[];
}

/** The user ids assigned to a card among the members, in the members' order. */
export function assigneesOf(cardId: string, rows: readonly Row[], members: readonly string[]): string[] {
  const on = new Set(rows.filter((row) => row.item_id === cardId && !row.deleted_at).map((row) => String(row.user_id)));
  return members.filter((id) => on.has(id));
}

export function assigneeChanges(
  cardId: string,
  rows: readonly Row[],
  chosen: readonly string[],
  members: ReadonlySet<string>,
): AssigneeChanges {
  const live = rows.filter((row) => row.item_id === cardId && !row.deleted_at && members.has(String(row.user_id)));
  const on = new Set(live.map((row) => String(row.user_id)));
  return {
    add: chosen
      .filter((userId) => !on.has(userId) && members.has(userId))
      .map((userId) => ({ id: uuidv7(), user_id: userId })),
    remove: live.filter((row) => !chosen.includes(String(row.user_id))).map((row) => String(row.id)),
  };
}

export const assigneeTarget = target;
