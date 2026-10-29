// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A card in its column (FR-KAN-03, D-92): its colour bar, labels, title,
// priority (not the default), due date, checklist progress ("2/5") and attachments; the card opens the editor.
// Overdue / due-soon badges come with HAAL-117.
import { CalendarClock, ListChecks, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { useSettings } from "@/api/settings";
import { PriorityBadge } from "@/components/ui/priority";
import { dueText } from "@/lib/cards";
import { DEFAULT_COLOR, swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

interface CardTileProps {
  row: Row;
  labels: Row[];
  /** Checked and all checklist items; null without a checklist. */
  progress: { done: number; total: number } | null;
  attachments: number;
  onOpen: () => void;
}

export function CardTile({ row, labels, progress, attachments, onOpen }: CardTileProps) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const title = typeof row.title === "string" ? row.title : "";
  const color = (typeof row.color === "string" ? row.color : DEFAULT_COLOR) as Color;
  const due = dueText(row, i18n.language, timeFormat);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("kanban.cards.open", { title })}
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-sm border border-line bg-bg p-2 pl-3 text-left text-[13px] wrap-anywhere",
          "hover:border-primary focus-visible:outline-2 focus-visible:outline-primary",
          // The colour as a bar only, like the wireframe (D7); the tint stays for labels.
          `ev-${color} ev-bar`,
        )}
      >
        {labels.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span
                key={String(label.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-1.5 text-[11px] font-medium",
                  `ev-${String(label.color)} ev-tint`,
                )}
              >
                <span className={cn("size-2 rounded-full", swatchClasses(label.color as Color))} aria-hidden />
                {String(label.name)}
              </span>
            ))}
          </span>
        ) : null}
        <span className="font-medium">{title}</span>
        {due || progress || attachments > 0 || row.priority !== "medium" ? (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
            <PriorityBadge priority={row.priority as Priority} hideDefault compact />
            {due ? (
              <span className="inline-flex items-center gap-1" aria-label={t("kanban.cards.due", { when: due })}>
                <CalendarClock className="size-3.5" aria-hidden />
                {due}
              </span>
            ) : null}
            {progress ? (
              <span
                className="inline-flex items-center gap-1 tabular-nums"
                aria-label={t("kanban.cards.progress", { done: progress.done, total: progress.total })}
              >
                <ListChecks className="size-3.5" aria-hidden />
                {progress.done}/{progress.total}
              </span>
            ) : null}
            {attachments > 0 ? (
              <span
                className="inline-flex items-center gap-1 tabular-nums"
                aria-label={t("kanban.cards.attachments", { count: attachments })}
              >
                <Paperclip className="size-3.5" aria-hidden />
                {attachments}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}
