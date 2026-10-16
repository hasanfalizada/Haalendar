// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Confirmation for consequential actions; the confirm button shows
// progress and the dialog stays open until the action has finished.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. focusConfirm: the confirm button gets the focus, so a keyboard
// delete is Delete then Enter (legacy F-16); Esc cancels.
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter } from "./dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  focusConfirm?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  focusConfirm = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        title={title}
        description={body}
        closeLabel={t("common.close")}
        {...(focusConfirm
          ? {
              onOpenAutoFocus: (event: Event) => {
                event.preventDefault();
                confirmButton.current?.focus();
              },
            }
          : {})}
      >
        <DialogFooter>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            ref={confirmButton}
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
