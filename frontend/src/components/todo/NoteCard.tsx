// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. A note in the grid (FR-TODO-01/03, D-87): its colour, title, the start
// of its text (plain), priority (not the default) and number of attachments; the card opens the editor. The actions
// below it act at once with a notification and undo: pin / unpin, colour (written when the palette closes — one write
// however many colours were tried), archive / unarchive and delete (soft; the trash restores it too).
import { Archive, ArchiveRestore, Paperclip, Palette, Pin, PinOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PriorityBadge } from "@/components/ui/priority";
import { toPlainText } from "@/lib/markdown-text";
import { text } from "@/lib/notes";
import { DEFAULT_COLOR, itemColorClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

import { deleteNote, noteName, updateNote } from "./noteWrites";

type Row = Record<string, unknown>;

export const PREVIEW_CHARS = 280;

interface NoteCardProps {
  user: string;
  row: Row;
  attachments: number;
  onOpen: () => void;
}

export function NoteCard({ user, row, attachments, onOpen }: NoteCardProps) {
  const { t } = useTranslation();
  const name = noteName(row);
  const title = text(row.title).trim();
  const plain = toPlainText(text(row.body));
  const preview = plain.length > PREVIEW_CHARS ? `${plain.slice(0, PREVIEW_CHARS).trimEnd()}…` : plain;
  const pinned = row.pinned === true;
  const archived = Boolean(row.archived_at);
  const stored = (text(row.color) || DEFAULT_COLOR) as Color;
  const [color, setColor] = useState<Color | null>(null);

  return (
    <article aria-label={name} className={cn("flex flex-col rounded-md border border-line", itemColorClasses(stored))}>
      <button
        type="button"
        aria-label={t("todo.card.open", { title: name })}
        className="flex min-h-16 flex-col gap-1.5 rounded-t-md p-3 text-left wrap-anywhere focus-visible:outline-2 focus-visible:outline-primary"
        onClick={onOpen}
      >
        {title ? <h3 className="text-[15px] font-semibold">{title}</h3> : null}
        {preview ? <p className="line-clamp-8 text-[13px] whitespace-pre-line text-fg/90">{preview}</p> : null}
        {attachments > 0 || text(row.priority) !== "medium" ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={text(row.priority) as Priority} hideDefault />
            {attachments > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <Paperclip className="size-3" aria-hidden />
                {t("todo.card.attachments", { count: attachments })}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
      <div className="mt-auto flex items-center gap-0.5 px-1 pb-1">
        {archived ? null : (
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={pinned}
            aria-label={t(pinned ? "todo.card.unpin" : "todo.card.pin", { title: name })}
            title={t(pinned ? "todo.card.unpinShort" : "todo.card.pinShort")}
            onClick={() => void updateNote(user, row, pinned ? "unpin" : "pin", { pinned: !pinned })}
          >
            {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          </Button>
        )}
        <Popover
          onOpenChange={(open) => {
            if (open || color === null) return;
            setColor(null);
            if (color !== stored) void updateNote(user, row, "color", { color });
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("todo.card.color", { title: name })}
              title={t("todo.card.colorShort")}
            >
              <Palette aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent sideOffset={4} className="w-[min(18rem,calc(100vw-2rem))] p-3">
            <ColorPicker
              name={`note-color-${String(row.id)}`}
              legend={t("todo.editor.color")}
              value={color ?? stored}
              onChange={setColor}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(archived ? "todo.card.unarchive" : "todo.card.archive", { title: name })}
          title={t(archived ? "todo.card.unarchiveShort" : "todo.card.archiveShort")}
          onClick={() =>
            void updateNote(user, row, archived ? "unarchive" : "archive", {
              archived_at: archived ? null : new Date().toISOString(),
            })
          }
        >
          {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={t("todo.card.delete", { title: name })}
          title={t("todo.card.deleteShort")}
          onClick={() => void deleteNote(user, row)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </article>
  );
}
