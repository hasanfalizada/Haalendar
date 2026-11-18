// +++===+++ 2026-11-17 22:40 +04 — Hasan Alizada — HAAL-102. Manage labels (FR-TODO-04, D-109): the user's personal
// labels of notes — create, rename or recolour, delete (a confirmation naming the notes it is on; it comes off them,
// Undo brings it back with them). Each is written at once with a notification and one undo step (labelWrites).
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { LabelDialog } from "@/components/kanban/LabelDialog";
import { createLabel, deleteLabel, updateLabel } from "@/components/kanban/labelWrites";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { PERSONAL_LABELS_MAX } from "@/lib/notes";
import { swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

interface NoteLabelsDialogProps {
  user: string;
  /** The user's live personal labels, by name. */
  labels: readonly Row[];
  /** Every label-on-item row of the local database (how many notes a label is on). */
  itemLabels: readonly Row[];
  onClose: () => void;
}

type Open = { kind: "new" } | { kind: "edit" | "delete"; row: Row } | null;

export function NoteLabelsDialog({ user, labels, itemLabels, onClose }: NoteLabelsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Open>(null);
  const notesWith = (labelId: string) => itemLabels.filter((row) => row.label_id === labelId && !row.deleted_at).length;
  const full = labels.length >= PERSONAL_LABELS_MAX;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title={t("todo.labels.manageTitle")} closeLabel={t("common.close")}>
        <p className="text-[13px] text-muted">{t("todo.labels.private")}</p>
        {labels.length === 0 ? <p className="text-[13px] text-muted">{t("todo.labels.none")}</p> : null}
        <ul className="flex flex-col">
          {labels.map((label) => {
            const name = String(label.name);
            return (
              <li key={String(label.id)} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
                <span className={cn("size-3 shrink-0 rounded-full", swatchClasses(label.color as Color))} aria-hidden />
                <span className="min-w-0 flex-1 wrap-anywhere">{name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("todo.labels.editOne", { name })}
                  onClick={() => {
                    setOpen({ kind: "edit", row: label });
                  }}
                >
                  <Pencil aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("todo.labels.deleteOne", { name })}
                  onClick={() => {
                    setOpen({ kind: "delete", row: label });
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        {full ? <p className="text-xs text-muted">{t("todo.labels.tooMany", { max: PERSONAL_LABELS_MAX })}</p> : null}
        <DialogFooter>
          <Button
            className="sm:mr-auto"
            disabled={full}
            onClick={() => {
              setOpen({ kind: "new" });
            }}
          >
            <Plus aria-hidden />
            {t("kanban.labels.new")}
          </Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>

      {open?.kind === "new" || open?.kind === "edit" ? (
        <LabelDialog
          row={open.kind === "edit" ? open.row : null}
          others={labels}
          scope="notes"
          onSave={async (name, color) => {
            if (open.kind === "edit") {
              const row = open.row;
              const data = {
                ...(name !== row.name ? { name } : {}),
                ...(color !== row.color ? { color } : {}),
              };
              return updateLabel(user, row, data);
            }
            return (await createLabel(user, null, name, color)) !== null;
          }}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={open?.kind === "delete"}
        title={t("kanban.labels.deleteTitle")}
        body={
          open?.kind === "delete"
            ? t("todo.labels.deleteBody", { name: String(open.row.name), count: notesWith(String(open.row.id)) })
            : ""
        }
        confirmLabel={t("kanban.deleteConfirm")}
        danger
        onConfirm={async () => {
          if (open?.kind !== "delete") return;
          if (await deleteLabel(user, open.row)) setOpen(null);
        }}
        onClose={() => {
          setOpen(null);
        }}
      />
    </Dialog>
  );
}
