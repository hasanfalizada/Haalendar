// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Note changes (FR-TODO-01/03, D-87) through the local store and
// outbox (offline too), each with a notification and one undo step: create (undone by a soft delete, redone by a
// restore), update of any fields — pin, colour, archive / unarchive or the editor's fields — (undone by sending the
// previous values back with the new ones as the base, so a change made meanwhile elsewhere becomes a conflict), delete
// (soft, with the attachments; undone by a restore — the trash restores it too). Archiving sends this device's time;
// the server keeps its own, and undo / redo send the time anew. Undo kinds are registered at start-up (App.tsx).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Checklist items (D-88): the editor's Save writes the note and its
// item changes as one write with one undo step; a checkbox on a card checks or unchecks one item with its own step.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. The note's reminders (D-89) go with Save as well.
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import type { ReminderChanges } from "@/components/calendar/reminderWrites";
import type { ChecklistChanges } from "@/lib/checklist";
import { type UndoStep, batchStep, newStep, registerUndo } from "@/lib/undo";
import { text } from "@/lib/notes";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

interface NoteRef {
  user: string;
  id: string;
}

interface NoteEdit extends NoteRef {
  before: Row;
  after: Row;
}

export type NoteChange = "edit" | "pin" | "unpin" | "color" | "archive" | "unarchive";

const target = (id: string) => ({ entity_type: "item" as const, entity_id: id });

// The archive time is sent anew each time ("now"), never an old one.
const fresh = (values: Row): Row =>
  values.archived_at ? { ...values, archived_at: new Date().toISOString() } : values;

registerUndo<NoteRef>("note.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<NoteEdit>("note.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: fresh(before) }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: fresh(after) }),
  }),
});

registerUndo<NoteRef>("note.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

const itemTarget = (id: string) => ({ entity_type: "checklist_item" as const, entity_id: id });

registerUndo<NoteRef>("checklist.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...itemTarget(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...itemTarget(id), op: "restore" }) }),
});

registerUndo<NoteEdit>("checklist.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...itemTarget(id), op: "update", base: after, data: before }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...itemTarget(id), op: "update", base: before, data: after }),
  }),
});

registerUndo<NoteRef>("checklist.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...itemTarget(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...itemTarget(id), op: "delete" }) }),
});

/** The title a notification names: the note's title, else the start of its text. */
export function noteName(row: Row): string {
  const title = text(row.title).trim();
  if (title) return title;
  const body = text(row.body).replace(/\s+/g, " ").trim();
  if (!body) return i18n.t("todo.untitled");
  return body.length > 40 ? `${body.slice(0, 40).trimEnd()}…` : body;
}

/** An update of the note; `data` holds the new values of the changed fields only. */
export async function updateNote(user: string, row: Row, change: NoteChange, data: Row): Promise<boolean> {
  const id = String(row.id);
  const base = Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null]));
  const values = { title: noteName({ ...row, ...data }) };
  const result = await runWrite({
    name: `note_${change}`,
    run: () =>
      mutate(user, {
        ...target(id),
        op: "update",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
        base,
        data,
      }),
    success: i18n.t(`todo.done.${change}`, values),
    undo: () =>
      newStep("note.update", { key: "undo.labels.noteChanged", values }, { user, id, before: base, after: data }),
  });
  return result.ok;
}

export async function deleteNote(user: string, row: Row): Promise<boolean> {
  const id = String(row.id);
  const values = { title: noteName(row) };
  const result = await runWrite({
    name: "note_delete",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "delete",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
      }),
    success: i18n.t("todo.done.deleted", values),
    undo: () => newStep("note.delete", { key: "undo.labels.noteDeleted", values }, { user, id }),
  });
  return result.ok;
}

const NO_CHANGES: ChecklistChanges = { create: [], update: [], remove: [] };

/**
 * The editor's Save: a new note (`row` null) or the changed fields of one, with its checklist changes — one write,
 * one notification, one undo step.
 */
export async function saveNote(
  user: string,
  id: string,
  row: Row | null,
  data: Row,
  items: ChecklistChanges = NO_CHANGES,
  reminders?: ReminderChanges,
): Promise<boolean> {
  const fields = Object.keys(data).length > 0;
  const count = items.create.length + items.update.length + items.remove.length + (reminders?.count ?? 0);
  if (row && !fields && count === 0) return true;
  const values = { title: noteName({ ...(row ?? {}), ...data }) };
  const base = row ? Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null])) : {};
  const label = { key: row ? "undo.labels.noteChanged" : "undo.labels.noteCreated", values };
  const result = await runWrite({
    name: row ? "note_edit" : "note_create",
    run: async () => {
      let written: { data: unknown } = { data: true };
      if (!row) written = await mutate(user, { ...target(id), op: "create", data: { kind: "note", ...data } });
      else if (fields) {
        const version = typeof row.version === "number" ? { base_version: row.version } : {};
        written = await mutate(user, { ...target(id), op: "update", ...version, base, data });
      }
      for (const entry of items.create) await mutate(user, { ...itemTarget(entry.id), op: "create", data: entry.data });
      for (const entry of items.update) {
        await mutate(user, { ...itemTarget(entry.id), op: "update", base: entry.base, data: entry.data });
      }
      for (const removed of items.remove) await mutate(user, { ...itemTarget(removed), op: "delete" });
      await reminders?.run();
      return written;
    },
    // A repeat would make a second note.
    retry: Boolean(row),
    success: i18n.t(row ? "todo.done.edit" : "todo.done.created", values),
    undo: () => {
      const steps: UndoStep[] = [
        ...(row
          ? fields
            ? [newStep("note.update", label, { user, id, before: base, after: data })]
            : []
          : [newStep("note.create", label, { user, id })]),
        ...items.create.map((entry) => newStep("checklist.create", label, { user, id: entry.id })),
        ...items.update.map((entry) =>
          newStep("checklist.update", label, { user, id: entry.id, before: entry.base, after: entry.data }),
        ),
        ...items.remove.map((removed) => newStep("checklist.delete", label, { user, id: removed })),
        ...(reminders?.steps ?? []),
      ];
      return steps.length === 1 && steps[0] ? steps[0] : batchStep(label, steps);
    },
  });
  return result.ok;
}

/** A checkbox on a card: one item checked or unchecked. */
export async function toggleItem(user: string, item: Row, note: Row): Promise<boolean> {
  const id = String(item.id);
  const checked = item.checked !== true;
  const values = { item: text(item.text), title: noteName(note) };
  const label = { key: "undo.labels.checklistToggled", values };
  const result = await runWrite({
    name: checked ? "checklist_check" : "checklist_uncheck",
    run: () =>
      mutate(user, {
        ...itemTarget(id),
        op: "update",
        ...(typeof item.version === "number" ? { base_version: item.version } : {}),
        base: { checked: !checked },
        data: { checked },
      }),
    success: i18n.t(checked ? "todo.done.checked" : "todo.done.unchecked", values),
    undo: () => newStep("checklist.update", label, { user, id, before: { checked: !checked }, after: { checked } }),
  });
  return result.ok;
}
