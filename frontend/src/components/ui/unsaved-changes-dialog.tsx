// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. "Unsaved changes" question (FR-X-09): Keep editing has the focus
// (Esc and the close button answer the same), Leave appears for editors with a local draft (it stays on this device),
// Discard drops the changes.
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import type { UnsavedPrompt } from "@/lib/useUnsavedGuard";

import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter } from "./dialog";

export function UnsavedChangesDialog({ prompt }: { prompt: UnsavedPrompt }) {
  const { t } = useTranslation();
  const keepButton = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={prompt.open}
      onOpenChange={(next) => {
        if (!next) prompt.keep();
      }}
    >
      <DialogContent
        title={t("unsaved.title")}
        description={prompt.hasDraft ? t("unsaved.bodyDraft") : t("unsaved.body")}
        closeLabel={t("common.close")}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          keepButton.current?.focus();
        }}
      >
        <DialogFooter>
          <Button variant="danger" onClick={prompt.discard}>
            {t("unsaved.discard")}
          </Button>
          {prompt.hasDraft ? <Button onClick={prompt.leave}>{t("unsaved.leave")}</Button> : null}
          <Button ref={keepButton} variant="primary" onClick={prompt.keep}>
            {t("unsaved.keep")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
