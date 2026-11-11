// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. Duplicate an event to another date (FR-CAL-34, C-10, D-84), from the
// details card ("Duplicate…", key D): one date field (the day after the copied start), Duplicate writes the copy at once
// through the local store and outbox like every event change (offline too) — all its fields, the same calendar, zone,
// times and length; an occurrence of a series becomes a one-off event —, the user's own reminders of the event and,
// on the server, the event's attachments. One notification, one undo step; the view then goes to the copy's date
// with its card open.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { runWrite } from "@/api/write";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { dayLabel } from "@/lib/dayView";
import { defaultTarget, duplicateData } from "@/lib/duplicate";
import { remindersOf } from "@/lib/reminders";
import { batchStep, newStep } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { localRows, mutate } from "@/sync";

import { reminderChanges } from "./reminderWrites";

type Row = Record<string, unknown>;

interface DuplicateDialogProps {
  user: string;
  row: Row;
  /** The occurrence shown (its date). */
  occurrence: string;
  onClose: () => void;
  /** The copy was written: its id and start date. */
  onDone: (id: string, date: string) => void;
}

export function DuplicateDialog({ user, row, occurrence, onClose, onDone }: DuplicateDialogProps) {
  const { t, i18n } = useTranslation();
  const [target, setTarget] = useState(() => defaultTarget(row, occurrence));
  const [busy, setBusy] = useState(false);
  const title = typeof row.title === "string" && row.title !== "" ? row.title : t("calendar.day.noTitle");

  async function start() {
    if (!target || busy) return;
    setBusy(true);
    const id = uuidv7();
    const values = { title, date: dayLabel(target, i18n.language) };
    const label = { key: "undo.labels.eventDuplicated", values };
    const own = remindersOf(await localRows(user, "reminder"), String(row.id)).map((reminder) => reminder.spec);
    const reminders = reminderChanges(user, id, [], own, label);
    const result = await runWrite({
      name: "event_duplicate",
      run: async () => {
        const written = await mutate(user, {
          entity_type: "item",
          entity_id: id,
          op: "create",
          data: duplicateData(row, occurrence, target),
        });
        await reminders.run();
        return written;
      },
      // A repeat would make a second copy.
      retry: false,
      success: t("calendar.copy.done", values),
      undo: () => batchStep(label, [newStep("event.create", label, { user, id }), ...reminders.steps]),
    });
    setBusy(false);
    if (result.ok) onDone(id, target);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent title={t("calendar.copy.title", { title })} closeLabel={t("common.close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <p className="text-[13px] text-muted">
            {t("calendar.copy.intro")}
            {row.rrule ? ` ${t("calendar.copy.series")}` : null}
          </p>
          <Field id="duplicate-date" label={t("calendar.copy.date")}>
            {(aria) => (
              <Input
                {...aria}
                type="date"
                required
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                }}
              />
            )}
          </Field>
          <DialogFooter>
            <Button onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !target}>
              {t("calendar.copy.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
