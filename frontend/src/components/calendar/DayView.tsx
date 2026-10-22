// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Day view (FR-CAL-01, F-14, D-61): the events of the selected date
// from the local database (works offline, follows sync and live updates), in calendar.day_order.v1 order. A row shows
// the colour (bar and tint), "All day" or the time range in the viewer's zone and 12/24-hour setting, whether it
// continues from an earlier day or goes on, the title, the place and a repeat mark. Navigation between days is
// HAAL-061, the header HAAL-062, the details popover HAAL-064.
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Repeat } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { meQuery } from "@/api/session";
import { type TimeFormat, useDisplayTimeZone } from "@/lib/datetime";
import { type DayEntry, dayLabel, entriesOn } from "@/lib/dayView";
import { itemColorClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";

function clock(hhmm: string, locale: string, timeFormat: TimeFormat): string {
  const [hour = 0, minute = 0] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: timeFormat === "12h" ? "h12" : "h23",
  }).format(Date.UTC(2000, 0, 1, hour, minute));
}

function When({ entry }: { entry: DayEntry }) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  if (entry.allDay || entry.start === null || entry.end === null) return <>{t("calendar.day.allDay")}</>;
  const [start, end] = [clock(entry.start, i18n.language, timeFormat), clock(entry.end, i18n.language, timeFormat)];
  if (entry.continues && entry.goesOn) return <>{t("calendar.day.allDayContinues")}</>;
  if (entry.continues) return <>{t("calendar.day.until", { time: end })}</>;
  if (entry.goesOn) return <>{t("calendar.day.from", { time: start })}</>;
  return <>{start === end ? start : `${start}–${end}`}</>;
}

export function DayView({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const viewerTz = useDisplayTimeZone();
  const { data: me } = useQuery(meQuery);
  const user = me?.id;
  const { data: rows = [] } = useQuery({
    queryKey: [...localKeys.table("item"), user ?? ""],
    queryFn: () => (user ? localRows(user, "item") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const entries = useMemo(() => entriesOn(rows, date, viewerTz), [rows, date, viewerTz]);
  const label = dayLabel(date, i18n.language);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <h1 className="text-lg font-semibold">{t("pages.calendar.title")}</h1>
        <p className="text-[13px] text-muted">{label}</p>
      </div>
      {entries.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-2">
            <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
              <CalendarDays className="size-6" aria-hidden />
            </div>
            <h2 className="text-[15px] font-semibold">{t("calendar.day.emptyTitle")}</h2>
            <p className="text-muted">{t("calendar.day.emptyBody")}</p>
          </div>
        </div>
      ) : (
        <ol aria-label={t("calendar.day.listLabel", { date: label })} className="flex flex-col gap-1.5 p-3 md:p-4">
          {entries.map((entry) => (
            <li
              key={entry.key}
              className={cn(
                "flex min-h-11 items-start gap-3 rounded-sm py-2 pr-3 pl-4 text-[13px]",
                itemColorClasses(entry.color),
              )}
            >
              <span className="w-28 shrink-0 text-muted tabular-nums">
                <When entry={entry} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 font-medium wrap-anywhere">
                  {entry.title || t("calendar.day.noTitle")}
                  {entry.recurring ? (
                    <Repeat className="size-3.5 shrink-0 text-muted" aria-label={t("calendar.day.repeats")} />
                  ) : null}
                </span>
                {entry.location ? (
                  <span className="flex items-center gap-1 text-xs text-muted wrap-anywhere">
                    <MapPin className="size-3 shrink-0" aria-hidden />
                    {entry.location}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
