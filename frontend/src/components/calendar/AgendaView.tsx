// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Agenda (FR-CAL-27, C-03, D-77): the days from the selected date on
// (the user's agenda range) that have events, each under its heading ("Today", "Tomorrow" or the date, with the full
// date beside them) with its events as rows like the day list — time, title, repeat / description / attachment icons,
// place. Today is shown whole, earlier events included. A row opens the details card; a heading opens that day in the
// day view. With no events in the whole range an empty state names the range.
// Long ranges render in batches: the first BATCH days with events at once, the next ones when the end of the list
// comes near (365 days of daily series are ~1900 rows); where IntersectionObserver is missing all render at once.
// +++===+++ 2026-11-24 11:00 +04 — Hasan Alizada — HAAL-121. A day's due dates of notes and cards (layers, D-122) above
// its events; a day with only those is shown too.
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { agendaOf } from "@/lib/agendaView";
import { addDays } from "@/lib/datetime";
import { dayLabel } from "@/lib/dayView";
import type { DueEntry } from "@/lib/dueLayers";
import { useAttachmentCounts, useRowFlags } from "@/lib/eventRow";
import { itemColorClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

import { type DetailsAnchor, EventButton } from "./EventButton";
import { DueChip } from "./DueChip";
import { EventRowBody } from "./EventRow";

type Row = Record<string, unknown>;

const BATCH = 31;

interface AgendaListProps {
  user: string | undefined;
  days: readonly string[];
  rows: readonly Row[];
  /** The due dates of notes and cards on the given days (layers, D-122). */
  duesOn?: (days: readonly string[]) => Map<string, DueEntry[]>;
  viewerTz: string;
  today: string;
  anchor: DetailsAnchor;
  /** Opens the day view of a date. */
  onDay: (date: string) => void;
}

export function AgendaList({ user, days, rows, duesOn, viewerTz, today, anchor, onDay }: AgendaListProps) {
  const { t, i18n } = useTranslation();
  const attachmentCounts = useAttachmentCounts(user);
  const rowFlags = useRowFlags();
  // +++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. In the order the user chose (D-111).
  const { day_order: by } = useSettings();
  const agenda = useMemo(() => agendaOf(rows, days, viewerTz, by, duesOn?.(days)), [rows, days, viewerTz, by, duesOn]);
  // A new range is a new list (the page keys it by its range), so it starts with one batch again.
  const [shown, setShown] = useState(() =>
    typeof IntersectionObserver === "undefined" ? Number.POSITIVE_INFINITY : BATCH,
  );
  const sentinel = useRef<HTMLDivElement>(null);
  const more = agenda.length > shown;
  useEffect(() => {
    const element = sentinel.current;
    if (!more || !element) return undefined;
    const observer = new IntersectionObserver(
      (seen) => {
        if (seen.some((entry) => entry.isIntersecting)) setShown((count) => count + BATCH);
      },
      { rootMargin: "600px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [more]);

  if (agenda.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-2">
          <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
            <CalendarDays className="size-6" aria-hidden />
          </div>
          <h2 className="text-[15px] font-semibold">{t("calendar.agenda.emptyTitle", { count: days.length })}</h2>
          <p className="text-muted">{t("calendar.agenda.emptyBody")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 p-3 md:p-4">
      {agenda.slice(0, shown).map(({ day, entries, dues }) => {
        const full = dayLabel(day, i18n.language);
        const relative =
          day === today ? t("calendar.header.today") : day === addDays(today, 1) ? t("calendar.agenda.tomorrow") : null;
        const headingId = `agenda-${day}`;
        return (
          <section key={day} aria-labelledby={headingId} className="flex flex-col gap-1.5">
            <h2 id={headingId} className="text-[13px] font-semibold">
              <button
                type="button"
                onClick={() => {
                  onDay(day);
                }}
                className={cn(
                  "flex items-baseline gap-2 rounded-sm text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary",
                  day === today && "text-primary",
                )}
              >
                {relative ? (
                  <>
                    <span>{relative}</span>{" "}
                  </>
                ) : null}
                <span className={cn(relative && "font-normal text-muted")}>{full}</span>
              </button>
            </h2>
            {dues.length > 0 ? (
              <ul
                aria-label={t("calendar.due.listLabel", { date: full })}
                className="flex flex-col gap-1.5 pointer-fine:md:gap-0.5"
              >
                {dues.map((due) => (
                  <li key={due.key}>
                    <DueChip entry={due} variant="row" />
                  </li>
                ))}
              </ul>
            ) : null}
            {entries.length > 0 ? (
              <ol aria-label={full} className="flex flex-col gap-1.5 pointer-fine:md:gap-0.5">
                {entries.map((entry) => {
                  const attachments = attachmentCounts.get(entry.id) ?? 0;
                  const flags = rowFlags(entry, attachments);
                  const flagsId = `agenda-flags-${day}-${entry.key}`;
                  return (
                    <li key={entry.key} className={cn("rounded-sm text-[13px]", itemColorClasses(entry.color))}>
                      <EventButton
                        entry={entry}
                        anchor={anchor}
                        place={day}
                        // +++===+++ 2026-11-19 11:00 +04 — Hasan Alizada — HAAL-189. Opened from the keyboard, below the row, as in the
                        // day list: beside a row as wide as the list there is no room (a click opens it at the cursor).
                        side="bottom"
                        describedBy={flags.length > 0 ? flagsId : undefined}
                        className="flex min-h-11 w-full items-start gap-3 rounded-sm py-2 pr-3 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary pointer-fine:md:min-h-7 pointer-fine:md:py-1"
                      >
                        <EventRowBody entry={entry} attachments={attachments} flags={flags} flagsId={flagsId} />
                      </EventButton>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        );
      })}
      {more ? <div ref={sentinel} aria-hidden className="h-px" /> : null}
    </div>
  );
}
