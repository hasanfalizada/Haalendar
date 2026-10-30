// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. The card editor (FR-KAN-03, D-92): a dialog on larger screens, full
// screen on phones; title (required), Markdown description, column (another column moves the card to its end), due
// date with an optional time (Clear removes both), colour, priority, checklist, attachments and the created / changed
// times. Save (or Ctrl+Enter) writes the changed fields and the checklist changes through the local store (offline too)
// as one undo step; Delete puts the card in the trash with Undo. It keeps a draft while typing and asks before unsaved
// changes are lost. Without the right to write (view share, archived board) everything is shown read-only.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112 (stage 3). The card's labels (CardLabels): chosen in the form, written
// with Save in the same undo step.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. The user's reminders of the card (FR-KAN-07, D-94): the event presets
// counted from the due date (timed ones with a due time, whole-day ones without), saved with Save in the same undo
// step. Without a due date nothing can be added (the chosen ones stay and can be removed). Reminders are personal, so
// a view share sets them too: the block stays open for it and Save appears once they change.
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { type SubmitEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { Attachments } from "@/components/attachments/Attachments";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";
import { reminderChanges } from "@/components/calendar/reminderWrites";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ChecklistEditor } from "@/components/todo/ChecklistEditor";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DraftNotice } from "@/components/ui/draft-notice";
import { Field, Input, Select } from "@/components/ui/input";
import { PrioritySelect } from "@/components/ui/priority";
import { type RecordTimes, RecordTimestamps } from "@/components/ui/record-timestamps";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { newCardPosition } from "@/lib/cards";
import { type ChecklistEntry, checklistChanges, checklistOf, entriesOf } from "@/lib/checklist";
import { DEFAULT_COLOR } from "@/lib/palette";
import { remindersOf, specsFromText, specsText } from "@/lib/reminders";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { localKeys, localRows } from "@/sync";

import { CardLabels } from "./CardLabels";
import { deleteCard, saveCard } from "./cardWrites";
import { labelChanges } from "./labelWrites";

type Row = Record<string, unknown>;

export const CARD_TITLE_MAX = 200;

interface CardForm {
  [field: string]: string;
  title: string;
  body: string;
  column_id: string;
  due_date: string;
  due_time: string;
  color: string;
  priority: string;
  /** The checklist as JSON (ChecklistEntry[]: unchecked in order, then checked). */
  checklist: string;
  /** The ids of the labels on the card as JSON (sorted). */
  labels: string;
  /** The user's reminders of the card as canonical text (specsText). */
  reminders: string;
}

// A stable empty list while the items load.
const NO_ROWS: Row[] = [];
const text = (value: unknown) => (typeof value === "string" ? value : "");

interface CardEditorProps {
  user: string;
  boardId: string;
  card: Row;
  /** The board's live labels, by name, and every label-on-item row of the local database. */
  labels: Row[];
  itemLabels: readonly Row[];
  /** The board's active columns, left to right. */
  columns: Row[];
  /** Every item row of the local database (where a moved card goes). */
  items: readonly Row[];
  canWrite: boolean;
  onClose: () => void;
}

export function CardEditor({
  user,
  boardId,
  card,
  labels,
  itemLabels,
  columns,
  items,
  canWrite,
  onClose,
}: CardEditorProps) {
  const { t } = useTranslation();
  const id = String(card.id);
  const { data: itemRows = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table("checklist_item"), user],
    queryFn: () => localRows(user, "checklist_item"),
    enabled: Boolean(user),
  });
  const stored = useMemo(() => {
    const groups = checklistOf(itemRows, id);
    return [...groups.unchecked, ...groups.checked];
  }, [itemRows, id]);
  const { data: reminderRows = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table("reminder"), user],
    queryFn: () => localRows(user, "reminder"),
    enabled: Boolean(user),
  });
  const existingReminders = useMemo(() => remindersOf(reminderRows, id), [reminderRows, id]);
  const live = useMemo(() => new Set(labels.map((label) => String(label.id))), [labels]);
  const onCard = useMemo(
    () =>
      itemLabels
        .filter((row) => row.item_id === id && !row.deleted_at && live.has(String(row.label_id)))
        .map((row) => String(row.label_id))
        .sort(),
    [itemLabels, id, live],
  );
  const baseline = useMemo<CardForm>(
    () => ({
      title: text(card.title),
      body: text(card.body),
      column_id: text(card.column_id),
      due_date: text(card.due_date),
      due_time: text(card.due_time),
      color: text(card.color) || DEFAULT_COLOR,
      priority: text(card.priority) || "medium",
      checklist: JSON.stringify(
        entriesOf({
          unchecked: stored.filter((row) => row.checked !== true),
          checked: stored.filter((row) => row.checked === true),
        }),
      ),
      labels: JSON.stringify(onCard),
      reminders: specsText(existingReminders.map((reminder) => reminder.spec)),
    }),
    [card, stored, onCard, existingReminders],
  );
  const [form, setForm] = useState<CardForm>(baseline);
  // The items arrive from the local database after opening: an untouched form follows them.
  const [seen, setSeen] = useState(baseline);
  if (seen !== baseline) {
    if (JSON.stringify(form) === JSON.stringify(seen)) setForm(baseline);
    setSeen(baseline);
  }
  const entries = JSON.parse(form.checklist) as ChecklistEntry[];
  const positionOf = (itemId: string) => {
    const row = stored.find((candidate) => candidate.id === itemId);
    return row ? text(row.position) : null;
  };
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const remindersDirty = form.reminders !== baseline.reminders;
  // What this user may save: everything with the right to write, else (a view share) the own reminders.
  const saving = canWrite || remindersDirty;
  const empty = form.title.trim() === "";
  const draft = useDraft({ scope: `card:${id}`, values: form, baseline, enabled: canWrite });
  const guard = useUnsavedGuard({
    dirty: (canWrite && dirty) || remindersDirty,
    hasDraft: canWrite,
    inDialog: true,
    scope: formRef,
    onLeave: () => draft.flush(),
    onDiscard: async () => {
      await draft.discard();
    },
    onSave: () => {
      if (!busy) formRef.current?.requestSubmit();
    },
  });
  // The column may be gone or archived meanwhile: it stays offered so the card can be moved out.
  const options = columns.some((column) => column.id === card.column_id)
    ? columns
    : [{ id: card.column_id, name: t("kanban.cards.hiddenColumn") }, ...columns];

  const set = (patch: Partial<CardForm>) => {
    setForm((current) => ({ ...current, ...patch }) as CardForm);
  };

  function close() {
    guard.requestClose(onClose);
  }

  async function save(): Promise<boolean> {
    const values: Row = {
      title: form.title.trim(),
      body: form.body,
      color: form.color,
      priority: form.priority,
      due_date: form.due_date || null,
      due_time: form.due_date && form.due_time ? form.due_time : null,
    };
    const changed: Row = Object.fromEntries(
      Object.entries(values).filter(
        ([name, value]) => (card[name] ?? null) !== value && !(card[name] === "" && value === ""),
      ),
    );
    if (form.column_id !== text(card.column_id)) {
      changed.column_id = form.column_id;
      changed.position = newCardPosition(items, form.column_id);
    }
    const chosen = JSON.parse(form.labels) as string[];
    const label = { key: "undo.labels.cardChanged", values: { title: form.title.trim() } };
    return saveCard(
      user,
      card,
      canWrite ? changed : {},
      canWrite ? checklistChanges(id, stored, entries) : undefined,
      canWrite ? labelChanges(id, itemLabels, chosen, live) : undefined,
      reminderChanges(user, id, existingReminders, specsFromText(form.reminders), label),
    );
  }

  async function onSubmit(submitted: SubmitEvent<HTMLFormElement>) {
    submitted.preventDefault();
    if (busy || empty || !saving) return;
    setBusy(true);
    await draft.flush();
    const ok = await save();
    setBusy(false);
    if (ok) {
      await draft.commit();
      onClose();
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        title={t(canWrite ? "kanban.cards.editTitle" : "kanban.cards.viewTitle")}
        closeLabel={t("common.close")}
        className="max-md:top-0 max-md:max-h-dvh max-md:rounded-none md:max-w-2xl"
      >
        {canWrite ? (
          <DraftNotice
            draft={draft.pending}
            onRestore={() => {
              const restored = draft.restore();
              if (restored) setForm(restored);
            }}
            onDiscard={() => void draft.discard()}
          />
        ) : null}
        <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          <fieldset disabled={!canWrite} className="flex min-w-0 flex-col gap-4">
            <Field id="card-title" label={t("kanban.cards.title")}>
              {(aria) => (
                <Input
                  {...aria}
                  value={form.title}
                  maxLength={CARD_TITLE_MAX}
                  required
                  autoFocus={canWrite}
                  onChange={(e) => {
                    set({ title: e.target.value });
                  }}
                />
              )}
            </Field>
            <MarkdownEditor
              id="card-body"
              label={t("kanban.cards.body")}
              value={form.body}
              rows={5}
              onChange={(body) => {
                set({ body });
              }}
            />
            <Field id="card-column" label={t("kanban.cards.column")}>
              {(aria) => (
                <Select
                  {...aria}
                  value={form.column_id}
                  onChange={(e) => {
                    set({ column_id: e.target.value });
                  }}
                >
                  {options.map((column) => (
                    <option key={String(column.id)} value={String(column.id)}>
                      {String(column.name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap items-end gap-2">
              <Field id="card-due-date" label={t("kanban.cards.dueDate")}>
                {(aria) => (
                  <Input
                    {...aria}
                    type="date"
                    value={form.due_date}
                    onChange={(e) => {
                      set({ due_date: e.target.value, ...(e.target.value ? {} : { due_time: "" }) });
                    }}
                  />
                )}
              </Field>
              <Field id="card-due-time" label={t("kanban.cards.dueTime")}>
                {(aria) => (
                  <Input
                    {...aria}
                    type="time"
                    value={form.due_time}
                    disabled={!form.due_date}
                    onChange={(e) => {
                      set({ due_time: e.target.value });
                    }}
                  />
                )}
              </Field>
              {form.due_date ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    set({ due_date: "", due_time: "" });
                  }}
                >
                  {t("kanban.cards.clearDue")}
                </Button>
              ) : null}
            </div>
          </fieldset>
          <ReminderPicker
            value={specsFromText(form.reminders)}
            allDay={!form.due_time}
            startLabel={t("kanban.cards.atDue")}
            {...(form.due_date ? {} : { noAdd: t("kanban.cards.remindersNeedDue") })}
            onChange={(next) => {
              set({ reminders: specsText(next) });
            }}
          />
          <fieldset disabled={!canWrite} className="flex min-w-0 flex-col gap-4">
            <CardLabels
              user={user}
              boardId={boardId}
              labels={labels}
              itemLabels={itemLabels}
              chosen={JSON.parse(form.labels) as string[]}
              onChange={(next) => {
                set({ labels: JSON.stringify([...next].sort()) });
              }}
              canWrite={canWrite}
            />
            <ColorPicker
              name="card-color"
              legend={t("kanban.cards.color")}
              value={form.color as Color}
              onChange={(color) => {
                set({ color });
              }}
            />
            {/* The priority picker brings its own legend. */}
            <PrioritySelect
              name="card-priority"
              value={form.priority as Priority}
              onChange={(priority) => {
                set({ priority });
              }}
            />
            <ChecklistEditor
              entries={entries}
              positionOf={positionOf}
              onChange={(next) => {
                set({ checklist: JSON.stringify(next) });
              }}
            />
          </fieldset>
          {/* A card made on this device that the server has not received yet (version 0) has no attachments there. */}
          {typeof card.version === "number" && card.version > 0 ? (
            <Attachments itemId={id} editable={canWrite} />
          ) : (
            <p className="text-xs text-muted">{t("kanban.cards.attachmentsLater")}</p>
          )}
          {typeof card.created_at === "string" && typeof card.updated_at === "string" ? (
            <RecordTimestamps record={card as unknown as RecordTimes} />
          ) : null}
          <DialogFooter>
            {canWrite ? (
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                onClick={() => {
                  void deleteCard(user, card).then(async (ok) => {
                    if (ok) {
                      await draft.discard();
                      onClose();
                    }
                  });
                }}
              >
                <Trash2 aria-hidden />
                {t("kanban.cards.delete")}
              </Button>
            ) : null}
            <Button onClick={close}>{t(saving ? "common.cancel" : "common.close")}</Button>
            {saving ? (
              <Button type="submit" variant="primary" disabled={busy || empty}>
                {t("kanban.save")}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
      <UnsavedChangesDialog prompt={guard.prompt} />
    </Dialog>
  );
}
