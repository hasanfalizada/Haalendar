// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. The "Notes & cards" panel of the day and week views (FR-INT-04, D-99):
// tabs Notes / Cards, a search, the items (those with a due date first), each with its due date or board and a clock
// when it is scheduled already. An item is dragged onto the calendar (mouse after 5 px, finger after a 300 ms hold)
// where dragging is offered, and "Schedule…" opens the event editor for it (keyboard, phones).
import { useDraggable } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ScheduleKind, type Schedulable, isTimeBlocked, schedulable } from "@/lib/timeBlock";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";

import type { SourceDragData } from "./EventDrag";
import { sourceTitle } from "./timeBlockWrites";

type Row = Record<string, unknown>;

function useRows(user: string, entity: "item" | "board" | "link"): Row[] {
  const { data = [] } = useQuery({
    queryKey: [...localKeys.table(entity), user],
    queryFn: () => localRows(user, entity),
    enabled: Boolean(user),
  });
  return data;
}

interface TimeBlockPanelProps {
  user: string;
  /** Items can be dragged onto the calendar here. */
  draggable: boolean;
  /** What to do with an item here (the week, the day list, a phone). */
  hint: string;
  /** False inside a sheet that has the title already. */
  showTitle?: boolean;
  onSchedule: (row: Row) => void;
}

export function TimeBlockPanel({ user, draggable, hint, showTitle = true, onSchedule }: TimeBlockPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ScheduleKind>("note");
  const [query, setQuery] = useState("");
  const items = useRows(user, "item");
  const boards = useRows(user, "board");
  const links = useRows(user, "link");
  const found = schedulable(items, boards, tab, query);

  return (
    <section aria-labelledby="time-block-title" className="flex min-h-0 flex-1 flex-col gap-2">
      <h2 id="time-block-title" className={cn("text-[13px] font-semibold", !showTitle && "sr-only")}>
        {t("calendar.timeBlock.title")}
      </h2>
      <div role="group" aria-label={t("calendar.timeBlock.title")} className="flex gap-1">
        {(["note", "card"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={tab === kind}
            onClick={() => {
              setTab(kind);
            }}
            className={cn(
              "h-11 flex-1 rounded-sm text-[13px] pointer-fine:md:h-8",
              tab === kind ? "bg-primary-tint text-primary" : "text-muted hover:bg-surface",
            )}
          >
            {t(kind === "note" ? "calendar.timeBlock.notes" : "calendar.timeBlock.cards")}
          </button>
        ))}
      </div>
      <Input
        type="search"
        aria-label={t("calendar.timeBlock.search")}
        placeholder={t("calendar.timeBlock.search")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <p className="text-xs text-muted">{hint}</p>
      {found.length === 0 ? <p className="text-xs text-muted">{t("calendar.timeBlock.none")}</p> : null}
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {found.map((entry) => (
          <PanelItem
            key={String(entry.row.id)}
            entry={entry}
            draggable={draggable}
            scheduled={isTimeBlocked(links, String(entry.row.id))}
            onSchedule={() => {
              onSchedule(entry.row);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

interface PanelItemProps {
  entry: Schedulable;
  draggable: boolean;
  scheduled: boolean;
  onSchedule: () => void;
}

function PanelItem({ entry, draggable, scheduled, onSchedule }: PanelItemProps) {
  const { t, i18n } = useTranslation();
  const title = sourceTitle(entry.row);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `source:${String(entry.row.id)}`,
    data: { source: entry.row, title, accepts: ["time", "allday", "day"] } satisfies SourceDragData,
    disabled: !draggable,
  });
  const due = entry.due
    ? new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", timeZone: "UTC" }).format(
        Date.parse(`${entry.due}T00:00:00Z`),
      )
    : null;
  const meta = [
    due ? t("calendar.timeBlock.due", { date: due }) : null,
    entry.boardName ? t("calendar.timeBlock.onBoard", { board: entry.boardName }) : null,
  ].filter(Boolean);
  return (
    <li
      ref={setNodeRef}
      {...(draggable ? listeners : {})}
      aria-roledescription={draggable ? t("calendar.timeBlock.drag", { title }) : undefined}
      className={cn(
        "flex items-center gap-2 rounded-sm border border-line bg-bg px-2 py-1.5 text-[13px]",
        draggable && "cursor-grab touch-manipulation select-none",
        isDragging && "opacity-50",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        {meta.length > 0 ? <span className="truncate text-xs text-muted">{meta.join(" · ")}</span> : null}
      </span>
      {scheduled ? (
        <Clock className="size-3.5 shrink-0 text-muted" role="img" aria-label={t("calendar.timeBlock.scheduled")} />
      ) : null}
      <Button
        variant="ghost"
        className="shrink-0 px-2"
        aria-label={t("calendar.timeBlock.scheduleNamed", { title })}
        // The button is not a drag handle (the sensors listen to mouse down and touch start).
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
        }}
        onClick={onSchedule}
      >
        {t("calendar.timeBlock.schedule")}
      </Button>
    </li>
  );
}
