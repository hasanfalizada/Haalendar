// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The note editor (FR-TODO-01, D-87): a dialog on larger screens, full
// screen on phones; title, Markdown text, colour, priority and — once the note exists — its attachments. Save (or
// Ctrl+Enter) writes through the local store (offline too); a note needs a title or some text. Like the event editor
// it keeps a draft while typing and asks before unsaved changes are lost. A new note goes on top of all notes.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. The checklist (D-88): Add checklist / Remove checklist, the items
// below the text (ChecklistEditor); Save writes the note and its item changes as one undo step. "New list" opens the
// editor with a checklist ready.
import { useQuery } from "@tanstack/react-query";
import { ListChecks, ListX } from "lucide-react";
import { type SubmitEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { useSettings } from "@/api/settings";
import { Attachments } from "@/components/attachments/Attachments";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DraftNotice } from "@/components/ui/draft-notice";
import { Field, Input } from "@/components/ui/input";
import { PrioritySelect } from "@/components/ui/priority";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { type ChecklistEntry, checklistChanges, checklistOf, entriesOf } from "@/lib/checklist";
import { text } from "@/lib/notes";
import { DEFAULT_COLOR } from "@/lib/palette";
import { topPosition } from "@/lib/position";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { uuidv7 } from "@/lib/uuid";
import { localKeys, localRows } from "@/sync";

import { ChecklistEditor } from "./ChecklistEditor";
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
  onClose: () => void;
}

export function NoteEditor({ user, note, positions, asList = false, onClose }: NoteEditorProps) {
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
    }),
    [note, settings.default_color, asList, stored, firstItem],
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
    if (!note) {
      const data = { ...fields, is_checklist: hasList, pinned: false, position: topPosition(positions) };
      return saveNote(user, id, null, data, items);
    }
    const changed: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([name, value]) => text(note[name]) !== value),
    );
    if ((note.is_checklist === true) !== hasList) changed.is_checklist = hasList;
    return saveNote(user, id, note, changed, items);
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
          {note ? (
            <Attachments itemId={id} editable />
          ) : (
            <p className="text-xs text-muted">{t("todo.editor.attachmentsLater")}</p>
          )}
          {empty ? <p className="text-xs text-muted">{t("todo.editor.empty")}</p> : null}
          <DialogFooter>
            <Button onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || empty}>
              {t("todo.editor.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <UnsavedChangesDialog prompt={guard.prompt} />
    </Dialog>
  );
}
