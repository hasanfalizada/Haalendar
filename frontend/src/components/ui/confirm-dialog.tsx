// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Confirmation for consequential actions; the confirm button shows
// progress and the dialog stays open until the action has finished.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter } from "./dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent title={title} description={body} closeLabel={t("common.close")}>
        <DialogFooter>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm().finally(() => {
                setBusy(false);
              });
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
