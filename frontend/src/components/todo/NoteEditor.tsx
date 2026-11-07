// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The note editor (FR-TODO-01, D-87): a dialog on larger screens, full
// screen on phones; title, Markdown text, colour, priority and — once the note exists — its attachments. Save (or
// Ctrl+Enter) writes through the local store (offline too); a note needs a title or some text. Like the event editor
// it keeps a draft while typing and asks before unsaved changes are lost. A new note goes on top of all notes.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. The checklist (D-88): Add checklist / Remove checklist, the items
// below the text (ChecklistEditor); Save writes the note and its item changes as one undo step. "New list" opens the
// editor with a checklist ready.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. The note's reminders (NoteReminders, D-89), saved with the note.
// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F7). Sharing (FR-ACC-10, D-30): the owner shares the note
// ("Share…", the shared dialog of calendars and boards); a note shared with the user says by whom and with which right,
// can be left, and with "can view" its content is read-only (the user's own reminders stay theirs to set).
import { useQuery } from "@tanstack/react-query";
import { ListChecks, ListX, LogOut, Users } from "lucide-react";
import { type SubmitEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { useSettings } from "@/api/settings";
import { sharesQuery } from "@/api/sharing";
import { Attachments } from "@/components/attachments/Attachments";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { useShareActions } from "@/components/sharing/useShareActions";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DraftNotice } from "@/components/ui/draft-notice";
import { Field, Input } from "@/components/ui/input";
import { PrioritySelect } from "@/components/ui/priority";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { type ChecklistEntry, checklistChanges, checklistOf, entriesOf } from "@/lib/checklist";
import { remindersOf, specsFromText, specsText } from "@/lib/reminders";
import { type NoteAccess, text } from "@/lib/notes";
import { DEFAULT_COLOR } from "@/lib/palette";
import { topPosition } from "@/lib/position";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { uuidv7 } from "@/lib/uuid";
import { localKeys, localRows } from "@/sync";

import { reminderChanges } from "@/components/calendar/reminderWrites";
import { ItemLinks } from "@/components/links/ItemLinks";

import { ChecklistEditor } from "./ChecklistEditor";
import { NoteReminders } from "./NoteReminders";
import { saveNote } from "./noteWrites";

type Row = Record<string, unknown>;

export const NOTE_TITLE_MAX = 200;

interface NoteForm {
  [field: string]: string;
  title: string;
  body: string;
  color: string;
  priority: string;
  /** "true" when the note has a checklist. */
  is_checklist: string;
  /** The checklist as JSON (ChecklistEntry[]: unchecked in order, then checked). */
  checklist: string;
  /** The user's reminders of the note as canonical text (specsText). */
  reminders: string;
}

// A stable empty list while the items load.
const NO_ROWS: Row[] = [];

interface NoteEditorProps {
  user: string;
  /** The note to edit, or null for a new one. */
  note: Row | null;
  /** Positions of all notes (a new note goes before them). */
  positions: readonly string[];
  /** A new note starts with a checklist ("New list"). */
  asList?: boolean;
  /** The user's right on the note (owner for a new one). */
  access?: NoteAccess;
  onClose: () => void;
}

export function NoteEditor({ user, note, positions, asList = false, access = "owner", onClose }: NoteEditorProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const [newId] = useState(uuidv7);
  const [firstItem] = useState(uuidv7);
  const id = note ? String(note.id) : newId;
  const { data: itemRows = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table("checklist_item"), user],
    queryFn: () => localRows(user, "checklist_item"),
    enabled: Boolean(user) && note !== null,
  });
  const { data: reminderRows = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table("reminder"), user],
    queryFn: () => localRows(user, "reminder"),
    enabled: Boolean(user) && note !== null,
  });
  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Whether the server has the note (version > 0), from the local rows,
  // which follow the sync: a note made on this device and not sent yet has no attachments there (asking got 404).
  const { data: noteRows = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table("item"), user],
    queryFn: () => localRows(user, "item"),
    enabled: Boolean(user) && note !== null,
  });
  const storedVersion = noteRows.find((row) => row.id === id)?.version;
  const onServer = typeof storedVersion === "number" && storedVersion > 0;
  const existingReminders = useMemo(() => remindersOf(reminderRows, id), [reminderRows, id]);
  const stored = useMemo(() => {
    const groups = checklistOf(itemRows, id);
    return [...groups.unchecked, ...groups.checked];
  }, [itemRows, id]);
  const baseline = useMemo<NoteForm>(
    () => ({
      title: text(note?.title),
      body: text(note?.body),
      color: text(note?.color) || settings.default_color || DEFAULT_COLOR,
      priority: text(note?.priority) || "medium",
      is_checklist: String(note ? note.is_checklist === true : asList),
      checklist: JSON.stringify(
        note
          ? entriesOf({
              unchecked: stored.filter((row) => row.checked !== true),
              checked: stored.filter((row) => row.checked === true),
            })
          : asList
            ? [{ id: firstItem, text: "", checked: false }]
            : [],
      ),
      reminders: specsText(existingReminders.map((reminder) => reminder.spec)),
    }),
    [note, settings.default_color, asList, stored, firstItem, existingReminders],
  );
  const [form, setForm] = useState<NoteForm>(baseline);
  // The items arrive from the local database after opening: an untouched form follows them.
  const [seen, setSeen] = useState(baseline);
  if (seen !== baseline) {
    if (JSON.stringify(form) === JSON.stringify(seen)) setForm(baseline);
    setSeen(baseline);
  }
  const entries = JSON.parse(form.checklist) as ChecklistEntry[];
  const hasList = form.is_checklist === "true";
  const positionOf = (itemId: string) => {
    const row = stored.find((candidate) => candidate.id === itemId);
    return row ? text(row.position) : null;
  };
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const readOnly = access === "view";
  const [sharing, setSharing] = useState(false);
  const shareActions = useShareActions();
  const received = useQuery({
    ...sharesQuery({ direction: "received", containerKind: "note", containerId: id }),
    enabled: note !== null && access !== "owner",
  });
  const share = received.data?.[0];
  const empty =
    form.title.trim() === "" &&
    form.body.trim() === "" &&
    !(hasList && entries.some((entry) => entry.text.trim() !== ""));
  const draft = useDraft({ scope: note ? `note:${id}` : "note:new", values: form, baseline });
  const guard = useUnsavedGuard({
    dirty,
    hasDraft: true,
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

  const set = (patch: Partial<NoteForm>) => {
    setForm((current) => ({ ...current, ...patch }) as NoteForm);
  };

  function close() {
    guard.requestClose(onClose);
  }

  async function save(): Promise<boolean> {
    const fields = { title: form.title.trim(), body: form.body, color: form.color, priority: form.priority };
    const items = checklistChanges(id, stored, hasList ? entries : []);
    const label = {
      key: note ? "undo.labels.noteChanged" : "undo.labels.noteCreated",
      values: { title: fields.title },
    };
    const reminders = reminderChanges(user, id, existingReminders, specsFromText(form.reminders), label);
    if (!note) {
      const data = { ...fields, is_checklist: hasList, pinned: false, position: topPosition(positions) };
      return saveNote(user, id, null, data, items, reminders);
    }
    const changed: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([name, value]) => text(note[name]) !== value),
    );
    if ((note.is_checklist === true) !== hasList) changed.is_checklist = hasList;
    return saveNote(user, id, note, changed, items, reminders);
  }

  async function onSubmit(submitted: SubmitEvent<HTMLFormElement>) {
    submitted.preventDefault();
    if (busy || empty) return;
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
        title={t(note ? "todo.editor.editTitle" : "todo.editor.newTitle")}
        closeLabel={t("common.close")}
        className="max-md:top-0 max-md:max-h-dvh max-md:rounded-none md:max-w-2xl"
      >
        <DraftNotice
          draft={draft.pending}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setForm(restored);
          }}
          onDiscard={() => void draft.discard()}
        />
        <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {access === "owner" ? null : (
            <p role="status" className="flex items-center gap-1.5 text-[13px] text-muted">
              <Users className="size-4 shrink-0" aria-hidden />
              {share
                ? t(access === "edit" ? "todo.editor.sharedEdit" : "todo.editor.sharedView", { name: share.owner_name })
                : t(access === "edit" ? "todo.card.sharedEdit" : "todo.card.sharedView")}
            </p>
          )}
          <fieldset disabled={readOnly} className="contents">
            <Field id="note-title" label={t("todo.editor.title")}>
              {(aria) => (
                <Input
                  {...aria}
                  value={form.title}
                  maxLength={NOTE_TITLE_MAX}
                  autoFocus
                  onChange={(e) => {
                    set({ title: e.target.value });
                  }}
                />
              )}
            </Field>
            <MarkdownEditor
              id="note-body"
              label={t("todo.editor.body")}
              value={form.body}
              rows={hasList ? 3 : 8}
              onChange={(body) => {
                set({ body });
              }}
            />
            {hasList ? (
              <ChecklistEditor
                entries={entries}
                positionOf={positionOf}
                onChange={(next) => {
                  set({ checklist: JSON.stringify(next) });
                }}
              />
            ) : null}
            <Button
              className="w-fit"
              onClick={() => {
                set(
                  hasList
                    ? { is_checklist: "false", checklist: "[]" }
                    : { is_checklist: "true", checklist: JSON.stringify([{ id: uuidv7(), text: "", checked: false }]) },
                );
              }}
            >
              {hasList ? <ListX aria-hidden /> : <ListChecks aria-hidden />}
              {t(hasList ? "todo.checklist.removeList" : "todo.checklist.addList")}
            </Button>
          </fieldset>
          <NoteReminders
            value={specsFromText(form.reminders)}
            onChange={(next) => {
              set({ reminders: specsText(next) });
            }}
          />
          <fieldset disabled={readOnly} className="contents">
            <ColorPicker
              name="note-color"
              legend={t("todo.editor.color")}
              value={form.color as Color}
              onChange={(color) => {
                set({ color });
              }}
            />
            {/* The priority picker brings its own legend. */}
            <PrioritySelect
              name="note-priority"
              value={form.priority as Priority}
              onChange={(priority) => {
                set({ priority });
              }}
            />
          </fieldset>
          {note && onServer ? (
            <Attachments itemId={id} editable={!readOnly} pasteTarget={formRef} />
          ) : note ? (
            <p className="text-xs text-muted">{t("todo.editor.attachmentsSyncing")}</p>
          ) : (
            <p className="text-xs text-muted">{t("todo.editor.attachmentsLater")}</p>
          )}
          {/* +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. The note's links (D-98), once it exists. */}
          {note ? (
            <ItemLinks
              user={user}
              item={note}
              canWrite={!readOnly}
              onLeave={() => {
                void draft.flush();
                onClose();
              }}
            />
          ) : null}
          {empty ? <p className="text-xs text-muted">{t("todo.editor.empty")}</p> : null}
          <DialogFooter>
            {note && access === "owner" ? (
              <Button
                className="sm:mr-auto"
                // Sharing needs the note on the server (a note made here may still be waiting to sync).
                disabled={!onServer}
                title={onServer ? undefined : t("todo.editor.shareSyncing")}
                onClick={() => {
                  setSharing(true);
                }}
              >
                <Users aria-hidden />
                {t("todo.editor.share")}
              </Button>
            ) : null}
            {note && access !== "owner" ? (
              <Button
                className="sm:mr-auto"
                disabled={!share}
                onClick={() => {
                  if (!share) return;
                  void shareActions.revoke(share, "grantee").then((result) => {
                    if (result.ok) onClose();
                  });
                }}
              >
                <LogOut aria-hidden />
                {t("todo.editor.leave")}
              </Button>
            ) : null}
            <Button onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || empty}>
              {t("todo.editor.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <UnsavedChangesDialog prompt={guard.prompt} />
      {sharing && note ? (
        <ShareDialog
          open
          onClose={() => {
            setSharing(false);
          }}
          containerKind="note"
          containerId={id}
          containerName={text(note.title) || t("todo.untitled")}
        />
      ) : null}
    </Dialog>
  );
}
