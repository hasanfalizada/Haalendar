// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. "This occurrence or all of them?" (FR-CAL-11..13, D-67): asked before
// deleting or editing a repeating event. "Only this occurrence" has the focus, so Delete → Enter removes one date
// (the safer choice); "All occurrences" works on the whole series; Esc or Cancel does nothing. The dialog stays open,
// its buttons disabled, until the chosen action has finished.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Without `allLabel` only "this occurrence" is offered (a series whose
// rule names its days cannot move as a whole to another day, D-80).
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

export type OccurrenceScope = "this" | "all";

interface OccurrenceChoiceProps {
  open: boolean;
  title: string;
  body: string;
  thisLabel: string;
  allLabel?: string | undefined;
  danger?: boolean;
  onChoose: (scope: OccurrenceScope) => Promise<void>;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export function OccurrenceChoice({
  open,
  title,
  body,
  thisLabel,
  allLabel,
  danger = false,
  onChoose,
  onClose,
  onCloseAutoFocus,
}: OccurrenceChoiceProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const choose = (scope: OccurrenceScope) => {
    setBusy(true);
    void onChoose(scope).finally(() => {
      setBusy(false);
    });
  };
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
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          first.current?.focus();
        }}
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      >
        <DialogFooter>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          {allLabel ? (
            <Button
              variant={danger ? "danger" : "secondary"}
              disabled={busy}
              onClick={() => {
                choose("all");
              }}
            >
              {allLabel}
            </Button>
          ) : null}
          <Button
            ref={first}
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={() => {
              choose("this");
            }}
          >
            {thisLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
