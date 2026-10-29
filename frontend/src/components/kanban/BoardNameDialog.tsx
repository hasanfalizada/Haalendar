// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. The name of a new board (row null) or of an existing one (D-90).
import { type SubmitEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

const NAME_MAX = 100;

interface BoardNameDialogProps {
  row: Record<string, unknown> | null;
  /** Saves the trimmed name; true when written. */
  onSave: (name: string) => Promise<boolean>;
  onClose: () => void;
}

export function BoardNameDialog({ row, onSave, onClose }: BoardNameDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(row ? String(row.name) : "");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || busy) return;
    if (row && trimmed === row.name) {
      onClose();
      return;
    }
    setBusy(true);
    const ok = await onSave(trimmed);
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
      <DialogContent title={t(row ? "kanban.renameTitle" : "kanban.newTitle")} closeLabel={t("common.close")}>
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          <Field id={`${id}-name`} label={t("kanban.name")}>
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
          <DialogFooter>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || !trimmed}>
              {t(row ? "kanban.save" : "kanban.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
