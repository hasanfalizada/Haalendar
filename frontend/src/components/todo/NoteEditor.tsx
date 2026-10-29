// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The note editor (FR-TODO-01, D-87): a dialog on larger screens, full
// screen on phones; title, Markdown text, colour, priority and — once the note exists — its attachments. Save (or
// Ctrl+Enter) writes through the local store (offline too); a note needs a title or some text. Like the event editor
// it keeps a draft while typing and asks before unsaved changes are lost. A new note goes on top of all notes.
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
import { text } from "@/lib/notes";
import { DEFAULT_COLOR } from "@/lib/palette";
import { topPosition } from "@/lib/position";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { uuidv7 } from "@/lib/uuid";

import { createNote, updateNote } from "./noteWrites";

type Row = Record<string, unknown>;

export const NOTE_TITLE_MAX = 200;

interface NoteForm {
  [field: string]: string;
  title: string;
  body: string;
  color: string;
  priority: string;
}

interface NoteEditorProps {
  user: string;
  /** The note to edit, or null for a new one. */
  note: Row | null;
  /** Positions of all notes (a new note goes before them). */
  positions: readonly string[];
  onClose: () => void;
}

export function NoteEditor({ user, note, positions, onClose }: NoteEditorProps) {
  const { t } = useTranslation();
  const settings = useSettings();
  const baseline = useMemo<NoteForm>(
    () => ({
      title: text(note?.title),
      body: text(note?.body),
      color: text(note?.color) || settings.default_color || DEFAULT_COLOR,
      priority: text(note?.priority) || "medium",
    }),
    [note, settings.default_color],
  );
  const [form, setForm] = useState<NoteForm>(baseline);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = note ? String(note.id) : null;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const empty = form.title.trim() === "" && form.body.trim() === "";
  const draft = useDraft({ scope: id ? `note:${id}` : "note:new", values: form, baseline });
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
    const values = { ...form, title: form.title.trim() };
    if (!note) {
      return createNote(user, uuidv7(), { ...values, pinned: false, position: topPosition(positions) });
    }
    const changed = Object.fromEntries(Object.entries(values).filter(([name, value]) => text(note[name]) !== value));
    if (Object.keys(changed).length === 0) return true;
    return updateNote(user, note, "edit", changed);
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
            rows={8}
            onChange={(body) => {
              set({ body });
            }}
          />
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
          {id ? (
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
