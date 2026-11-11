// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. Undo / redo for the event editor (FR-X-06, D-64): creating is undone
// by a soft delete and redone by a restore; an edit is undone by sending the previous values back (with the new ones
// as the base, so a change made meanwhile on another device becomes a conflict instead of being overwritten).
// Changes go through the local store and outbox like every content write. Registered at start-up (App.tsx).
import { registerUndo } from "@/lib/undo";
import { mutate } from "@/sync";

export interface EventCreated {
  user: string;
  id: string;
}

export interface EventEdited {
  user: string;
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

const target = (id: string) => ({ entity_type: "item" as const, entity_id: id });

registerUndo<EventCreated>("event.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<EventEdited>("event.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: before }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: after }),
  }),
});

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-065. A delete (soft, with its attachments in one batch on the server) is
// undone by a restore of that batch and redone by deleting again.
export interface EventDeleted {
  user: string;
  id: string;
}

registerUndo<EventDeleted>("event.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. One occurrence left the series (deleted, or replaced by a one-off
// copy — that copy is undone by its own "event.create" step in the same batch): undone by including the date again.
export interface OccurrenceExcluded {
  user: string;
  id: string;
  date: string;
}

registerUndo<OccurrenceExcluded>("event.exclude", {
  undo: ({ user, id, date }) => ({
    run: () => mutate(user, { ...target(id), op: "include", data: { occurrence_date: date } }),
  }),
  redo: ({ user, id, date }) => ({
    run: () => mutate(user, { ...target(id), op: "exclude", data: { occurrence_date: date } }),
  }),
});

// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. A date given back to a series (a moved series takes its excluded
// dates along, D-78): undone by excluding it again.
registerUndo<OccurrenceExcluded>("event.include", {
  undo: ({ user, id, date }) => ({
    run: () => mutate(user, { ...target(id), op: "exclude", data: { occurrence_date: date } }),
  }),
  redo: ({ user, id, date }) => ({
    run: () => mutate(user, { ...target(id), op: "include", data: { occurrence_date: date } }),
  }),
});

// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Reminders set or removed in the editor (D-79): a new one is undone by
// a soft delete and redone by a restore; a removed one the other way round.
export interface ReminderChanged {
  user: string;
  id: string;
}

const reminder = (id: string) => ({ entity_type: "reminder" as const, entity_id: id });

registerUndo<ReminderChanged>("reminder.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...reminder(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...reminder(id), op: "restore" }) }),
});

registerUndo<ReminderChanged>("reminder.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...reminder(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...reminder(id), op: "delete" }) }),
});
