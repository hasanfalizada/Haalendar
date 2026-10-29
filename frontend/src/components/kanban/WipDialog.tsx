// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The WIP limit of a column (FR-KAN-02, D-91): a number from 1 to 999,
// or empty for none. Exceeding it only warns.
import { type SubmitEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

const WIP_MAX = 999;

interface WipDialogProps {
  row: Record<string, unknown>;
  /** Saves the limit (null = none); true when written. */
  onSave: (limit: number | null) => Promise<boolean>;
  onClose: () => void;
}

export function WipDialog({ row, onSave, onClose }: WipDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const current = typeof row.wip_limit === "number" ? row.wip_limit : null;
  const [text, setText] = useState(current === null ? "" : String(current));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = text.trim();
    const limit = trimmed === "" ? null : Number(trimmed);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > WIP_MAX)) {
      setProblem(t("kanban.columns.wipInvalid", { max: WIP_MAX }));
      return;
    }
    if (limit === current) {
      onClose();
      return;
    }
    setBusy(true);
    const ok = await onSave(limit);
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
      <DialogContent title={t("kanban.columns.wipTitle", { name: String(row.name) })} closeLabel={t("common.close")}>
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">{t("kanban.columns.wipHint")}</p>
          <Field id={`${id}-wip`} label={t("kanban.columns.wipLabel")} error={problem ?? undefined}>
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={1}
                max={WIP_MAX}
                value={text}
                autoFocus
                onChange={(e) => {
                  setText(e.target.value);
                  setProblem(null);
                }}
              />
            )}
          </Field>
          <DialogFooter>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {t("kanban.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
