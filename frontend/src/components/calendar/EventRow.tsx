// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. The inside of an event row (taken out of the day list for the agenda):
// the time ("All day", "09:00–09:30", "Until 02:00", "From 22:00"), the title with the repeat, description and
// attachment icons (HAAL-083, D-72), the place, and the flags for screen readers under `flagsId`.
import { FileText, MapPin, Paperclip, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DayEntry } from "@/lib/dayView";
import { useEntryTime } from "@/lib/entryTime";

interface EventRowBodyProps {
  entry: DayEntry;
  attachments: number;
  flags: string[];
  flagsId: string;
}

export function EventRowBody({ entry, attachments, flags, flagsId }: EventRowBodyProps) {
  const { t } = useTranslation();
  const { range } = useEntryTime();
  return (
    <>
      <span className="w-28 shrink-0 text-muted tabular-nums">{range(entry)}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 font-medium wrap-anywhere">
          {entry.title || t("calendar.day.noTitle")}
          {entry.recurring ? (
            <span title={t("calendar.day.repeats")} className="shrink-0">
              <Repeat className="size-3.5 text-muted" aria-hidden />
            </span>
          ) : null}
          {entry.hasDescription ? (
            <span title={t("calendar.day.hasDescription")} className="shrink-0">
              <FileText className="size-3.5 text-muted" aria-hidden />
            </span>
          ) : null}
          {attachments > 0 ? (
            <span title={t("calendar.details.attachments", { count: attachments })} className="shrink-0">
              <Paperclip className="size-3.5 text-muted" aria-hidden />
            </span>
          ) : null}
        </span>
        {entry.location ? (
          <span className="flex items-center gap-1 text-xs text-muted wrap-anywhere">
            <MapPin className="size-3 shrink-0" aria-hidden />
            {entry.location}
          </span>
        ) : null}
      </span>
      {flags.length > 0 ? (
        <span id={flagsId} className="sr-only">
          {flags.join(", ")}
        </span>
      ) : null}
    </>
  );
}
