// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-121. A due date on a layer of the calendar (FR-CAL-24, D-122): the
// sign of a note or a card instead of an event's colour bar, a dashed outline, its time when it has one and its title;
// overdue or due soon with the cards' sign (never the colour alone). A click opens the note on the To-Do page or the
// card on its board. It is neither dragged nor selected. `chip` in the month and the week's all-day row, `row` in the
// day list and the agenda.
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Clock, Columns3, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { DueBadge } from "@/components/kanban/CardTile";
import { dueState } from "@/lib/cards";
import { useDisplayTimeZone } from "@/lib/datetime";
import { clockText } from "@/lib/dayView";
import type { DueEntry } from "@/lib/dueLayers";
import { itemTarget } from "@/lib/links";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";

export function DueChip({ entry, variant }: { entry: DueEntry; variant: "chip" | "row" }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { time_format: timeFormat } = useSettings();
  const state = dueState(entry.row, useDisplayTimeZone(), useNow());
  const time = entry.time ? clockText(entry.time, i18n.language, timeFormat) : null;
  const title = entry.title || t("calendar.day.noTitle");
  const Kind = entry.kind === "note" ? ListChecks : Columns3;
  const label = [
    t(entry.kind === "note" ? "calendar.due.note" : "calendar.due.card", {
      title,
      when: time ?? t("calendar.due.allDay"),
    }),
    state ? t(state === "overdue" ? "calendar.due.overdue" : "calendar.due.soon") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        const target = itemTarget(entry.row);
        if (target) void navigate(target);
      }}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded-sm border border-dashed border-line bg-surface text-left outline-none focus-visible:ring-2 focus-visible:ring-primary",
        variant === "chip"
          ? "h-5 px-1"
          : "min-h-11 gap-2 px-3 py-2 text-[13px] pointer-fine:md:min-h-7 pointer-fine:md:py-1",
      )}
    >
      <Kind className="size-3.5 shrink-0 text-muted" aria-hidden />
      {variant === "chip" && state ? (
        state === "overdue" ? (
          <AlertTriangle className="size-3.5 shrink-0 text-danger" aria-hidden />
        ) : (
          <Clock className="size-3.5 shrink-0 text-warn-fg" aria-hidden />
        )
      ) : null}
      {time ? (
        <span aria-hidden className="shrink-0 text-muted tabular-nums">
          {time}
        </span>
      ) : null}
      <span aria-hidden className="truncate font-medium">
        {title}
      </span>
      {variant === "row" && state ? (
        <span aria-hidden className="ml-auto shrink-0 text-xs">
          <DueBadge state={state} />
        </span>
      ) : null}
    </button>
  );
}
