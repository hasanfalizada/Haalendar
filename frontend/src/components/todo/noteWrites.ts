// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Note changes (FR-TODO-01/03, D-87) through the local store and
// outbox (offline too), each with a notification and one undo step: create (undone by a soft delete, redone by a
// restore), update of any fields — pin, colour, archive / unarchive or the editor's fields — (undone by sending the
// previous values back with the new ones as the base, so a change made meanwhile elsewhere becomes a conflict), delete
// (soft, with the attachments; undone by a restore — the trash restores it too). Archiving sends this device's time;
// the server keeps its own, and undo / redo send the time anew. Undo kinds are registered at start-up (App.tsx).
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { newStep, registerUndo } from "@/lib/undo";
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

/** The title a notification names: the note's title, else the start of its text. */
export function noteName(row: Row): string {
  const title = text(row.title).trim();
  if (title) return title;
  const body = text(row.body).replace(/\s+/g, " ").trim();
  if (!body) return i18n.t("todo.untitled");
  return body.length > 40 ? `${body.slice(0, 40).trimEnd()}…` : body;
}

export async function createNote(user: string, id: string, data: Row): Promise<boolean> {
  const values = { title: noteName(data) };
  const result = await runWrite({
    name: "note_create",
    run: () => mutate(user, { ...target(id), op: "create", data: { kind: "note", ...data } }),
    // A repeat would make a second note.
    retry: false,
    success: i18n.t("todo.done.created", values),
    undo: () => newStep("note.create", { key: "undo.labels.noteCreated", values }, { user, id }),
  });
  return result.ok;
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
