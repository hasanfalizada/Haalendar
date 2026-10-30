// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A card in its column (FR-KAN-03, D-92): its colour bar, labels, title,
// priority (not the default), due date, checklist progress ("2/5") and attachments; the card opens the editor.
// Overdue / due-soon badges come with HAAL-117.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. A card is dragged with the mouse (after 5 px) or a finger (after a
// 300 ms hold) and is a drop target — the upper half puts the moved card before it, the lower half after it; Alt+arrows
// move it from the keyboard (FR-KAN-04). Only for whoever may write.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. A bell while one of the user's reminders of the card is ahead (D-94).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-117. The due date as a badge when overdue (red, a warning sign, "Overdue")
// or due soon (amber, a clock, "Due soon") — never the colour alone (FR-KAN-08, D-95).
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { AlertTriangle, Bell, CalendarClock, Clock, ListChecks, Paperclip } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { useSettings } from "@/api/settings";
import type { CardStep, DueState } from "@/lib/cards";
import { PriorityBadge } from "@/components/ui/priority";
import { dueText } from "@/lib/cards";
import { DEFAULT_COLOR, swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

const STEPS: Partial<Record<string, CardStep>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** What a dragged card carries and what a card as a drop target says (BoardColumns). */
export interface CardDragData {
  type: "card";
  row: Row;
}

export interface CardDropData {
  type: "card";
  columnId: string;
  cardId: string;
}

interface CardTileProps {
  row: Row;
  labels: Row[];
  /** Checked and all checklist items; null without a checklist. */
  progress: { done: number; total: number } | null;
  attachments: number;
  /** One of the user's reminders of the card is still ahead. */
  reminder?: boolean;
  /** Overdue, due soon or neither (dueState). */
  dueState?: DueState;
  onOpen: () => void;
  /** Alt+arrow on the card; without it (no right to write) the card is not dragged either. */
  onStep?: (step: CardStep) => void;
}

/** "Overdue" / "Due soon" with its sign, and what follows (the date on a card). */
export function DueBadge({ state, children }: { state: "overdue" | "soon"; children?: ReactNode }) {
  const { t } = useTranslation();
  const Icon = state === "overdue" ? AlertTriangle : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1 font-medium",
        state === "overdue" ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn-fg",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span>{t(state === "overdue" ? "kanban.cards.overdue" : "kanban.cards.dueSoon")}</span>
      {children}
    </span>
  );
}

export function CardTile({
  row,
  labels,
  progress,
  attachments,
  reminder = false,
  dueState = null,
  onOpen,
  onStep,
}: CardTileProps) {
  const { t, i18n } = useTranslation();
  const id = String(row.id);
  const movable = onStep !== undefined;
  const {
    setNodeRef: dragRef,
    listeners,
    isDragging,
  } = useDraggable({ id: `card-${id}`, data: { type: "card", row } satisfies CardDragData, disabled: !movable });
  const { setNodeRef: dropRef } = useDroppable({
    id: `over-${id}`,
    data: { type: "card", columnId: String(row.column_id), cardId: id } satisfies CardDropData,
    disabled: !movable,
  });
  const { time_format: timeFormat } = useSettings();
  const title = typeof row.title === "string" ? row.title : "";
  const color = (typeof row.color === "string" ? row.color : DEFAULT_COLOR) as Color;
  const due = dueText(row, i18n.language, timeFormat);

  return (
    // The padding (not a gap between cards) keeps the drop targets edge to edge.
    <li ref={dropRef} className="py-1">
      <button
        ref={dragRef}
        type="button"
        data-card={id}
        onClick={onOpen}
        {...(movable ? listeners : {})}
        onKeyDown={(event) => {
          const step = event.altKey && !event.ctrlKey && !event.metaKey ? STEPS[event.key] : undefined;
          if (!step || !onStep) return;
          // Alt+← / Alt+→ are also the browser's Back / Forward.
          event.preventDefault();
          onStep(step);
        }}
        aria-label={t("kanban.cards.open", { title })}
        aria-description={movable ? t("kanban.cards.moveHint") : undefined}
        aria-keyshortcuts={movable ? "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight" : undefined}
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-sm border border-line bg-bg p-2 pl-3 text-left text-[13px] wrap-anywhere",
          "hover:border-primary focus-visible:outline-2 focus-visible:outline-primary",
          // A finger held on the card picks it up instead of selecting text or opening the system menu.
          movable && "touch-manipulation select-none [-webkit-touch-callout:none]",
          isDragging && "opacity-50",
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
        {due || progress || attachments > 0 || reminder || row.priority !== "medium" ? (
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
            <PriorityBadge priority={row.priority as Priority} hideDefault compact />
            {due && dueState ? (
              <span
                aria-label={t(dueState === "overdue" ? "kanban.cards.dueOverdue" : "kanban.cards.dueSoonAt", {
                  when: due,
                })}
              >
                <DueBadge state={dueState}>
                  <span aria-hidden>· {due}</span>
                </DueBadge>
              </span>
            ) : due ? (
              <span className="inline-flex items-center gap-1" aria-label={t("kanban.cards.due", { when: due })}>
                <CalendarClock className="size-3.5" aria-hidden />
                {due}
              </span>
            ) : null}
            {reminder ? <Bell className="size-3.5" role="img" aria-label={t("kanban.cards.reminder")} /> : null}
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
