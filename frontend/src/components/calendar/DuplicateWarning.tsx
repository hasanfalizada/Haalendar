// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-080. "An event with this title already exists" (FR-CAL-16, D-69): asked on
// Save when the title matches other active events; lists up to five (title, day, calendar) with "Show" for each.
// "Back to editing" has the focus (Enter and Esc never save a duplicate by accident); "Save anyway" saves.
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

export interface DuplicateMatch {
  id: string;
  title: string;
  /** The day it is shown on ("YYYY-MM-DD"), or null when unknown. */
  day: string | null;
  calendarName: string | null;
}

const SHOWN = 5;

interface DuplicateWarningProps {
  open: boolean;
  matches: DuplicateMatch[];
  onShow: (match: DuplicateMatch) => void;
  onSaveAnyway: () => Promise<void>;
  onBack: () => void;
}

export function DuplicateWarning({ open, matches, onShow, onSaveAnyway, onBack }: DuplicateWarningProps) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const dayText = (day: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(
      Date.parse(`${day}T00:00:00Z`),
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onBack();
      }}
    >
      <DialogContent
        title={t("calendar.duplicate.title")}
        description={t("calendar.duplicate.body", { count: matches.length })}
        closeLabel={t("common.close")}
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault();
          back.current?.focus();
        }}
      >
        <ul aria-label={t("calendar.duplicate.listLabel")} className="flex flex-col gap-1.5 text-[13px]">
          {matches.slice(0, SHOWN).map((match) => (
            <li key={match.id} className="flex items-center gap-2 rounded-sm border border-line px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium wrap-anywhere">{match.title}</span>
                <span className="text-xs text-muted">
                  {[match.day ? dayText(match.day) : null, match.calendarName].filter(Boolean).join(" · ")}
                </span>
              </span>
              {match.day ? (
                <Button
                  variant="ghost"
                  aria-label={t("calendar.duplicate.showLabel", { title: match.title })}
                  onClick={() => {
                    onShow(match);
                  }}
                >
                  {t("calendar.duplicate.show")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {matches.length > SHOWN ? (
          <p className="text-xs text-muted">{t("calendar.duplicate.more", { count: matches.length - SHOWN })}</p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onSaveAnyway().finally(() => {
                setBusy(false);
              });
            }}
          >
            {t("calendar.duplicate.saveAnyway")}
          </Button>
          <Button ref={back} variant="primary" disabled={busy} onClick={onBack}>
            {t("calendar.duplicate.back")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
