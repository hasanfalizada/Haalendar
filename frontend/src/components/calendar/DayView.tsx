// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Day view (FR-CAL-01, F-14, D-61): the events of the selected date
// from the local database (works offline, follows sync and live updates), in calendar.day_order.v1 order. A row shows
// the colour (bar and tint), "All day" or the time range in the viewer's zone and 12/24-hour setting, whether it
// continues from an earlier day or goes on, the title, the place and a repeat mark. Navigation between days is
// HAAL-061, the header HAAL-062, the details popover HAAL-064.
// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. Navigation (FR-CAL-02..04, F-01..F-04, D-62): ‹ Today › in the header
// and the keys ← / → / T (D-42); the date stays in the URL and moving between days replaces the history entry (Back
// leaves the calendar instead of stepping through days). The mini month sits in a sidebar: inline and collapsible on
// desktops (remembered on this device), an overlay on tablets, a bottom sheet behind the date button on phones.
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-062. Header (FR-CAL-05, D-63): the date title ("Today" or the long date) is
// the page heading (the module name is read before it), with the weekday, the live clock and the ISO week of the
// selected date; on phones the title is the button that opens the mini month, clock and week on a second line.
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, MapPin, PanelLeft, Plus, Repeat } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { meQuery } from "@/api/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { addDays, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { type DayEntry, clockText, dateTitle, dayLabel, entriesOn, weekdayName } from "@/lib/dayView";
import { itemColorClasses } from "@/lib/palette";
import { useShortcut } from "@/lib/shortcuts";
import { DESKTOP_UP, TABLET_UP, useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";

import { IsoWeekLabel, LiveClock } from "./HeaderInfo";
import { EventEditor } from "./EventEditor";
import { MiniMonth } from "./MiniMonth";

const SIDEBAR_KEY = "haalendar.calendar.sidebar";

function storedSidebarOpen(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

function storeSidebarOpen(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, open ? "open" : "collapsed");
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

function When({ entry }: { entry: DayEntry }) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  if (entry.allDay || entry.start === null || entry.end === null) return <>{t("calendar.day.allDay")}</>;
  const [start, end] = [
    clockText(entry.start, i18n.language, timeFormat),
    clockText(entry.end, i18n.language, timeFormat),
  ];
  if (entry.continues && entry.goesOn) return <>{t("calendar.day.allDayContinues")}</>;
  if (entry.continues) return <>{t("calendar.day.until", { time: end })}</>;
  if (entry.goesOn) return <>{t("calendar.day.from", { time: start })}</>;
  return <>{start === end ? start : `${start}–${end}`}</>;
}

function DayList({ date, entries, onOpen }: { date: string; entries: DayEntry[]; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const label = dayLabel(date, i18n.language);
  if (entries.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-2">
          <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
            <CalendarDays className="size-6" aria-hidden />
          </div>
          <h2 className="text-[15px] font-semibold">{t("calendar.day.emptyTitle")}</h2>
          <p className="text-muted">{t("calendar.day.emptyBody")}</p>
        </div>
      </div>
    );
  }
  return (
    <ol aria-label={t("calendar.day.listLabel", { date: label })} className="flex flex-col gap-1.5 p-3 md:p-4">
      {entries.map((entry) => (
        <li key={entry.key} className={cn("rounded-sm text-[13px]", itemColorClasses(entry.color))}>
          {/* +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. The row opens the editor (the details popover of HAAL-064
              will take this over and offer Edit). */}
          <button
            type="button"
            aria-label={t("calendar.day.edit", { title: entry.title || t("calendar.day.noTitle") })}
            onClick={() => {
              onOpen(entry.id);
            }}
            className="flex min-h-11 w-full items-start gap-3 rounded-sm py-2 pr-3 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          </button>
        </li>
      ))}
    </ol>
  );
}

export function DayView({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const viewerTz = useDisplayTimeZone();
  const { week_start: weekStart } = useSettings();
  const desktop = useMediaQuery(DESKTOP_UP);
  const tablet = useMediaQuery(TABLET_UP);
  const { data: me } = useQuery(meQuery);
  const user = me?.id;
  const { data: rows = [] } = useQuery({
    queryKey: [...localKeys.table("item"), user ?? ""],
    queryFn: () => (user ? localRows(user, "item") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const entries = useMemo(() => entriesOn(rows, date, viewerTz), [rows, date, viewerTz]);
  const today = todayIn(viewerTz);
  const label = dayLabel(date, i18n.language);
  const title = dateTitle(date, today, i18n.language, t("calendar.header.today"));
  const weekday = weekdayName(date, i18n.language);

  const [pinned, setPinned] = useState(storedSidebarOpen);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. The open editor: a new event (null) or the event row to edit.
  const [editing, setEditing] = useState<{ event: Record<string, unknown> | null } | null>(null);
  const [shownDays, setShownDays] = useState<readonly string[]>([]);
  const marked = useMemo(
    () => new Set(shownDays.filter((day) => entriesOn(rows, day, viewerTz).length > 0)),
    [shownDays, rows, viewerTz],
  );

  // The day the keys move from is read when the key is pressed (a held key repeats faster than the page re-renders).
  const current = () => (router.state.location.search as { date?: string }).date ?? today;
  const go = useCallback(
    (target: string) => {
      void navigate({ to: "/calendar", search: { date: target }, replace: true });
    },
    [navigate],
  );
  useShortcut({
    id: "calendar:previous-day",
    keys: ["Left"],
    group: "navigation",
    label: "calendar.nav.previousDay",
    handler: () => {
      go(addDays(current(), -1));
    },
  });
  useShortcut({
    id: "calendar:next-day",
    keys: ["Right"],
    group: "navigation",
    label: "calendar.nav.nextDay",
    handler: () => {
      go(addDays(current(), 1));
    },
  });
  useShortcut({
    id: "calendar:today",
    keys: ["T"],
    group: "navigation",
    label: "calendar.nav.goToday",
    handler: () => {
      go(today);
    },
  });
  useShortcut({
    id: "calendar:new-event",
    keys: ["N"],
    group: "items",
    label: "calendar.editor.newButton",
    enabled: editing === null,
    handler: () => {
      setEditing({ event: null });
    },
  });

  function toggleSidebar() {
    if (desktop) {
      storeSidebarOpen(!pinned);
      setPinned(!pinned);
    } else {
      setOverlayOpen(!overlayOpen);
    }
  }

  const miniMonth = (onPicked?: () => void) => (
    <MiniMonth
      selected={date}
      today={today}
      weekStart={weekStart}
      marked={marked}
      onMonthShown={setShownDays}
      onSelect={(picked) => {
        go(picked);
        onPicked?.();
      }}
    />
  );
  const sidebarOpen = desktop ? pinned : overlayOpen;

  return (
    <div className="flex h-full min-h-0">
      {desktop && pinned ? (
        <aside
          id="calendar-sidebar"
          aria-label={t("calendar.nav.sidebar")}
          className="w-[248px] shrink-0 overflow-y-auto border-r border-line bg-surface p-3"
        >
          {miniMonth()}
        </aside>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2 py-1.5 md:px-4">
          {tablet ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(sidebarOpen ? "calendar.nav.hideSidebar" : "calendar.nav.showSidebar")}
              aria-expanded={sidebarOpen}
              {...(desktop ? { "aria-controls": "calendar-sidebar" } : {})}
              onClick={toggleSidebar}
            >
              <PanelLeft aria-hidden />
            </Button>
          ) : null}
          {tablet ? (
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="text-lg font-semibold">
                <span className="sr-only">{t("pages.calendar.title")}: </span>
                {title}
              </h1>
              <span className="text-[13px] text-muted">{weekday}</span>
            </div>
          ) : (
            <h1 className="min-w-0 text-base font-semibold">
              <span className="sr-only">{t("pages.calendar.title")}: </span>
              <Button
                variant="ghost"
                className="-ml-2 px-2 text-base font-semibold"
                aria-label={t("calendar.nav.chooseDate", { date: label })}
                onClick={() => {
                  setPickerOpen(true);
                }}
              >
                {title}
                <ChevronDown aria-hidden />
              </Button>
            </h1>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("calendar.nav.previousDay")}
              onClick={() => {
                go(addDays(date, -1));
              }}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              disabled={date === today}
              onClick={() => {
                go(today);
              }}
            >
              {t("calendar.nav.today")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("calendar.nav.nextDay")}
              onClick={() => {
                go(addDays(date, 1));
              }}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <div className="flex w-full items-center gap-3 text-xs text-muted md:ml-auto md:w-auto md:text-[13px]">
            <LiveClock timeZone={viewerTz} />
            <IsoWeekLabel date={date} />
          </div>
          {tablet ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing({ event: null });
              }}
            >
              <Plus aria-hidden />
              {t("calendar.editor.newButton")}
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DayList
            date={date}
            entries={entries}
            onOpen={(id) => {
              setEditing({ event: rows.find((row) => row.id === id) ?? null });
            }}
          />
        </div>
      </div>
      {tablet && !desktop ? (
        <Sheet open={overlayOpen} onOpenChange={setOverlayOpen}>
          <SheetContent title={t("calendar.nav.sidebar")} closeLabel={t("common.close")}>
            {miniMonth(() => {
              setOverlayOpen(false);
            })}
          </SheetContent>
        </Sheet>
      ) : null}
      {!tablet ? (
        <Button
          variant="primary"
          size="icon"
          aria-label={t("calendar.editor.newButton")}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg"
          onClick={() => {
            setEditing({ event: null });
          }}
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      ) : null}
      {editing ? (
        <EventEditor
          date={date}
          event={editing.event}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {!tablet ? (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent title={t("calendar.nav.pickDate")} closeLabel={t("common.close")}>
            {miniMonth(() => {
              setPickerOpen(false);
            })}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
