// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112 (stage 3). The labels in the card editor (FR-KAN-03, D-92): every label
// of the board as a toggle (on the card or not — written with the editor's Save); "New label…" creates a board label at
// once and puts it on the card; each label's menu renames / recolours it or deletes it from the board (a confirmation
// naming the cards it is on; Undo brings it back with them). Board labels are written at once, with Undo.
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

import { LabelDialog } from "./LabelDialog";
import { createLabel, deleteLabel, updateLabel } from "./labelWrites";

type Row = Record<string, unknown>;

interface CardLabelsProps {
  user: string;
  boardId: string;
  /** The board's live labels, by name. */
  labels: Row[];
  /** Every label-on-item row of the local database (how many cards a label is on). */
  itemLabels: readonly Row[];
  /** The ids of the labels chosen for the card. */
  chosen: string[];
  onChange: (next: string[]) => void;
  canWrite: boolean;
}

type Dialog = { kind: "new" } | { kind: "edit" | "delete"; row: Row } | null;

export function CardLabels({ user, boardId, labels, itemLabels, chosen, onChange, canWrite }: CardLabelsProps) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<Dialog>(null);
  const cardsWith = (labelId: string) => itemLabels.filter((row) => row.label_id === labelId && !row.deleted_at).length;

  function toggle(labelId: string) {
    onChange(chosen.includes(labelId) ? chosen.filter((id) => id !== labelId) : [...chosen, labelId]);
  }

  return (
    <section aria-labelledby="card-labels" className="flex flex-col gap-2">
      <h3 id="card-labels" className="text-[13px] font-medium">
        {t("kanban.labels.title")}
      </h3>
      {labels.length === 0 ? <p className="text-xs text-muted">{t("kanban.labels.none")}</p> : null}
      <ul className="flex flex-wrap gap-1.5">
        {labels.map((label) => {
          const labelId = String(label.id);
          const name = String(label.name);
          const on = chosen.includes(labelId);
          return (
            <li
              key={labelId}
              className={cn(
                "inline-flex items-center rounded-sm border",
                on ? `ev-${String(label.color)} ev-tint border-primary` : "border-line",
              )}
            >
              <button
                type="button"
                aria-pressed={on}
                className="inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] pointer-fine:md:min-h-8"
                onClick={() => {
                  toggle(labelId);
                }}
              >
                <span className={cn("size-2.5 rounded-full", swatchClasses(label.color as Color))} aria-hidden />
                {name}
              </button>
              {canWrite ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={t("kanban.labels.menu", { name })}
                    >
                      <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialog({ kind: "edit", row: label });
                      }}
                    >
                      {t("kanban.labels.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      danger
                      onSelect={() => {
                        setDialog({ kind: "delete", row: label });
                      }}
                    >
                      {t("kanban.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <Button
          className="w-fit"
          onClick={() => {
            setDialog({ kind: "new" });
          }}
        >
          <Plus aria-hidden />
          {t("kanban.labels.new")}
        </Button>
      ) : null}

      {dialog?.kind === "new" || dialog?.kind === "edit" ? (
        <LabelDialog
          row={dialog.kind === "edit" ? dialog.row : null}
          others={labels}
          onSave={async (name, color) => {
            if (dialog.kind === "edit") {
              const row = dialog.row;
              const data = {
                ...(name !== row.name ? { name } : {}),
                ...(color !== row.color ? { color } : {}),
              };
              return updateLabel(user, row, data);
            }
            const id = await createLabel(user, boardId, name, color);
            if (id) onChange([...chosen, id]);
            return id !== null;
          }}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("kanban.labels.deleteTitle")}
        body={
          dialog?.kind === "delete"
            ? t("kanban.labels.deleteBody", { name: String(dialog.row.name), count: cardsWith(String(dialog.row.id)) })
            : ""
        }
        confirmLabel={t("kanban.deleteConfirm")}
        danger
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          const row = dialog.row;
          if (await deleteLabel(user, row)) {
            onChange(chosen.filter((id) => id !== row.id));
            setDialog(null);
          }
        }}
        onClose={() => {
          setDialog(null);
        }}
      />
    </section>
  );
}
