// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112 (stage 3). A new board label (row null) or the name and colour of one
// (D-92): name 1-40, not the name of another label of the board (case ignored), colour of the palette.
import { type SubmitEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

type Row = Record<string, unknown>;

const NAME_MAX = 40;

interface LabelDialogProps {
  row: Row | null;
  /** The board's other live labels (their names are taken). */
  others: readonly Row[];
  /** Saves the trimmed name and the colour; true when written. */
  onSave: (name: string, color: Color) => Promise<boolean>;
  onClose: () => void;
}

export function LabelDialog({ row, others, onSave, onClose }: LabelDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(row ? String(row.name) : "");
  const [color, setColor] = useState<Color>(row ? (row.color as Color) : "blue");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const taken = others.some(
    (other) => other.id !== row?.id && String(other.name).toLowerCase() === trimmed.toLowerCase(),
  );

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // Opened from the card editor: in React's tree this form sits inside the editor's form, which must not submit too.
    event.stopPropagation();
    if (!trimmed || taken || busy) return;
    if (row && trimmed === row.name && color === row.color) {
      onClose();
      return;
    }
    setBusy(true);
    const ok = await onSave(trimmed, color);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={t(row ? "kanban.labels.editTitle" : "kanban.labels.newTitle")}
        closeLabel={t("common.close")}
      >
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          <Field id={`${id}-name`} label={t("kanban.name")} error={taken ? t("kanban.labels.taken") : undefined}>
            {(aria) => (
              <Input
                {...aria}
                value={name}
                maxLength={NAME_MAX}
                required
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <ColorPicker name={`${id}-color`} legend={t("kanban.labels.color")} value={color} onChange={setColor} />
          <DialogFooter>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || !trimmed || taken}>
              {t(row ? "kanban.save" : "kanban.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
