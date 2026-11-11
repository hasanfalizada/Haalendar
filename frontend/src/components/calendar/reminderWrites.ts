// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. What saving the editor's reminders writes (D-79): reminders no longer
// in the list are deleted (soft), new ones created; an unchanged one is left alone (a changed reminder is a removed one
// and a new one). Written through the local store like the event, in the same undo step.
import type { UndoLabel, UndoStep } from "@/lib/undo";
import { newStep } from "@/lib/undo";
import { type ReminderSpec, specKey } from "@/lib/reminders";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

export interface ReminderChanges {
  count: number;
  run: () => Promise<void>;
  steps: UndoStep[];
}

export function reminderChanges(
  user: string,
  itemId: string,
  before: readonly { id: string; spec: ReminderSpec }[],
  after: readonly ReminderSpec[],
  label: UndoLabel,
): ReminderChanges {
  const wanted = new Set(after.map(specKey));
  const had = new Set(before.map((reminder) => specKey(reminder.spec)));
  const removed = before.filter((reminder) => !wanted.has(specKey(reminder.spec)));
  const added = after.filter((spec) => !had.has(specKey(spec))).map((spec) => ({ id: uuidv7(), spec }));
  return {
    count: removed.length + added.length,
    run: async () => {
      for (const { id } of removed) await mutate(user, { entity_type: "reminder", entity_id: id, op: "delete" });
      for (const { id, spec } of added) {
        await mutate(user, {
          entity_type: "reminder",
          entity_id: id,
          op: "create",
          data: { item_id: itemId, ...spec },
        });
      }
    },
    steps: [
      ...removed.map(({ id }) => newStep("reminder.delete", label, { user, id })),
      ...added.map(({ id }) => newStep("reminder.create", label, { user, id })),
    ],
  };
}
