// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Changes of the user's calendars (FR-CAL-32, D-82) from the calendar
// sidebar: create, rename and colour, make default, archive / unarchive and delete go through the local store and
// outbox (offline too) with a notification and an undo step; hiding is the user setting `hidden_calendars` (a request
// with If-Match, so it needs a connection; the answer is put into the settings and the synced settings row at once).
// Archiving sends this device's time — the server keeps its own; undoing an unarchive sends the time again.
import type { QueryClient } from "@tanstack/react-query";

import { getSettings, updateSettings } from "@/api/generated/sdk.gen";
import type { Settings } from "@/api/generated/types.gen";
import { settingsQueryKey } from "@/api/settings";
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { registerUndo, newStep } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { localKeys, mutate } from "@/sync";
import { localDb } from "@/sync/db";

type Row = Record<string, unknown>;

interface CalendarRef {
  user: string;
  id: string;
}

interface CalendarEdit extends CalendarRef {
  before: Row;
  after: Row;
}

const target = (id: string) => ({ entity_type: "calendar" as const, entity_id: id });

registerUndo<CalendarRef>("calendar.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<CalendarRef>("calendar.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

// The archive time is sent anew each time ("now"), never an old one.
const fresh = (values: Row): Row =>
  values.archived_at ? { ...values, archived_at: new Date().toISOString() } : values;

registerUndo<CalendarEdit>("calendar.update", {
  undo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: after, data: fresh(before) }),
  }),
  redo: ({ user, id, before, after }) => ({
    run: () => mutate(user, { ...target(id), op: "update", base: before, data: fresh(after) }),
  }),
});

// The default moves from one calendar to another (only "true" is ever sent): undo makes `from` the default again.
interface DefaultMove {
  user: string;
  from: string;
  to: string;
}

async function makeDefault(user: string, id: string, previous: string | null) {
  // The server takes the default from the previous calendar itself; this device shows it at once (before the change,
  // whose local write refreshes what is shown).
  if (previous) await (await localDb(user)).calendars.update(previous, { is_default: false });
  return mutate(user, { ...target(id), op: "update", base: { is_default: false }, data: { is_default: true } });
}

registerUndo<DefaultMove>("calendar.default", {
  undo: ({ user, from, to }) => ({ run: () => makeDefault(user, from, to) }),
  redo: ({ user, from, to }) => ({ run: () => makeDefault(user, to, from) }),
});

const nameOf = (row: Row) => String(row.name);

export async function createCalendar(user: string, name: string, color: string): Promise<boolean> {
  const id = uuidv7();
  const values = { name };
  const result = await runWrite({
    name: "calendar_create",
    run: () => mutate(user, { ...target(id), op: "create", data: { name, color } }),
    success: i18n.t("calendars.created", values),
    undo: () => newStep("calendar.create", { key: "undo.labels.calendarCreated", values }, { user, id }),
  });
  return result.ok;
}

export type CalendarChange = "edit" | "archive" | "unarchive";

/** Makes `row` the default calendar instead of `previous` (its id). */
export async function setDefaultCalendar(user: string, row: Row, previous: string | null): Promise<boolean> {
  const id = String(row.id);
  const values = { name: nameOf(row) };
  const result = await runWrite({
    name: "calendar_default",
    run: () => makeDefault(user, id, previous),
    success: i18n.t("calendars.done.default", values),
    undo: () =>
      previous
        ? newStep("calendar.default", { key: "undo.labels.calendarDefault", values }, { user, from: previous, to: id })
        : null,
  });
  return result.ok;
}

/** An update of the calendar's own fields; `data` holds the new values. */
export async function updateCalendar(user: string, row: Row, change: CalendarChange, data: Row): Promise<boolean> {
  const id = String(row.id);
  const base = Object.fromEntries(Object.keys(data).map((name) => [name, row[name] ?? null]));
  const values = { name: nameOf(row) };
  const label = { key: "undo.labels.calendarChanged", values };
  const result = await runWrite({
    name: `calendar_${change}`,
    run: () =>
      mutate(user, {
        ...target(id),
        op: "update",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
        base,
        data,
      }),
    success: i18n.t(`calendars.done.${change}`, values),
    undo: () => newStep("calendar.update", label, { user, id, before: base, after: data }),
  });
  return result.ok;
}

export async function deleteCalendar(user: string, row: Row): Promise<boolean> {
  const id = String(row.id);
  const values = { name: nameOf(row) };
  const result = await runWrite({
    name: "calendar_delete",
    run: () =>
      mutate(user, {
        ...target(id),
        op: "delete",
        ...(typeof row.version === "number" ? { base_version: row.version } : {}),
      }),
    success: i18n.t("calendars.done.delete", values),
    undo: () => newStep("calendar.delete", { key: "undo.labels.calendarDeleted", values }, { user, id }),
  });
  return result.ok;
}

/** Shows or hides a calendar in the views (user setting); true when saved. */
export async function setHidden(
  client: QueryClient,
  user: string,
  calendarId: string,
  hide: boolean,
): Promise<boolean> {
  const send = async () => {
    // The current settings, read anew (another device may have changed them).
    const read = await getSettings();
    if (read.error !== undefined) return read;
    const current = read.data;
    const list = new Set(current.hidden_calendars);
    if (hide) list.add(calendarId);
    else list.delete(calendarId);
    return updateSettings({
      headers: { "If-Match": `"${String(current.version)}"` },
      body: { hidden_calendars: [...list].sort() },
    });
  };
  const result = await runWrite<Settings>({
    name: hide ? "calendar_hide" : "calendar_show",
    run: async () => {
      const first = await send();
      // Changed meanwhile on another device: once more on the current version.
      return first.response?.status === 412 ? send() : first;
    },
    success: () => null,
    onSuccess: async (saved) => {
      client.setQueryData(settingsQueryKey, saved);
      const db = await localDb(user);
      await db.settings.update(user, { hidden_calendars: saved.hidden_calendars });
      await client.invalidateQueries({ queryKey: localKeys.table("settings") });
    },
  });
  return result.ok;
}
