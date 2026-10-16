// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Offer to bring back a draft kept on this device (useDraft, D-39).
import { useTranslation } from "react-i18next";

import type { PendingDraft } from "@/lib/useDraft";
import type { DraftFields } from "@/lib/drafts";
import { formatInstant, useDisplayTimeZone } from "@/lib/datetime";

import { Button } from "./button";

interface DraftNoticeProps<F extends DraftFields> {
  draft: PendingDraft<F> | null;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftNotice<F extends DraftFields>({ draft, onRestore, onDiscard }: DraftNoticeProps<F>) {
  const { t, i18n } = useTranslation();
  const timeZone = useDisplayTimeZone();
  if (!draft) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-warn-bg px-3 py-2 text-[13px] text-warn-fg"
    >
      <span className="min-w-0 flex-1">
        {t("drafts.found", { time: formatInstant(draft.savedAt, timeZone, i18n.language) })}
      </span>
      <Button variant="primary" onClick={onRestore}>
        {t("drafts.restore")}
      </Button>
      <Button variant="ghost" onClick={onDiscard}>
        {t("drafts.discard")}
      </Button>
    </div>
  );
}
