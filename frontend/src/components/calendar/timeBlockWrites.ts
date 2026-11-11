// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. A time block (FR-INT-04, D-99): the event made from a note or card and
// its link to it (origin time_block) — one write through the local store (offline too), one notification, one undo
// step (undone: the link removed and the event deleted). The editor's "Schedule…" adds the same link (linkStep).
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { type EventForm, eventData } from "@/lib/eventForm";
import { type UndoLabel, batchStep, newStep } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

import "@/components/links/linkWrites";
import { noteName } from "@/components/todo/noteWrites";
import "./undo-events";

/** The title an event made from the item takes. */
export function sourceTitle(row: Record<string, unknown>): string {
  return row.kind === "note" ? noteName(row) : typeof row.title === "string" ? row.title : "";
}

/** The link of a new event to the item it was made from. */
export function timeBlockLink(eventId: string, sourceId: string) {
  return {
    id: uuidv7(),
    write: (user: string, id: string) =>
      mutate(user, {
        entity_type: "link",
        entity_id: id,
        op: "create",
        data: { from_item_id: eventId, to_item_id: sourceId, origin: "time_block" },
      }),
  };
}

export function linkStep(label: UndoLabel, user: string, id: string) {
  return newStep("link.create", label, { user, id });
}

/** Makes the event of `form` linked to `sourceId`; its id when written, else null. */
export async function blockItem(user: string, sourceId: string, form: EventForm, tzid: string): Promise<string | null> {
  const id = uuidv7();
  const link = timeBlockLink(id, sourceId);
  const values = { title: form.title.trim() };
  const label = { key: "undo.labels.timeBlocked", values };
  const result = await runWrite({
    name: "time_block",
    run: async () => {
      const written = await mutate(user, {
        entity_type: "item",
        entity_id: id,
        op: "create",
        data: { kind: "event", container_kind: "calendar", container_id: form.calendar_id, tzid, ...eventData(form) },
      });
      await link.write(user, link.id);
      return written;
    },
    // A repeat would make a second event.
    retry: false,
    success: i18n.t("calendar.timeBlock.done", values),
    undo: () => batchStep(label, [newStep("event.create", label, { user, id }), linkStep(label, user, link.id)]),
  });
  return result.ok ? id : null;
}
