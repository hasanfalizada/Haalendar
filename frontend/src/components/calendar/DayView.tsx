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
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-065. Delete (FR-CAL-09, F-16/F-17, D-66): from the details card or with the
// Delete key on the focused row, after a confirmation whose focused button makes it Delete → Enter; a series goes as a
// whole (one occurrence: HAAL-067). Soft and offline through the local store; undo restores it, so does the trash. A
// calendar shared for viewing says so instead. The list has one Tab stop: ↑/↓, Home/End, Enter / E open the card.
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. A repeating event asks "only this occurrence or all?" (D-67) before
// Delete (this: the date leaves the series, undoable; all: the series goes to the trash) and before Edit (this: the
// editor works on a one-off copy of the date; all: the series).
// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-068. The overdue counter sits under the mini month wherever it is shown
// (sidebar, tablet overlay, phone date sheet).
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, MapPin, PanelLeft, Plus, Repeat } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { meQuery } from "@/api/session";
import { runWrite } from "@/api/write";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { addDays, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { type DayEntry, clockText, dateTitle, dayLabel, entriesOn, weekdayName } from "@/lib/dayView";
import { notify } from "@/lib/notify";
import { itemColorClasses } from "@/lib/palette";
import { useShortcut } from "@/lib/shortcuts";
import { newStep } from "@/lib/undo";
import { useListNavigation } from "@/lib/useListNavigation";
import { DESKTOP_UP, TABLET_UP, useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { localKeys, localRows, mutate } from "@/sync";

import { IsoWeekLabel, LiveClock } from "./HeaderInfo";
import { EventDetails } from "./EventDetails";
import { EventEditor } from "./EventEditor";
import { MiniMonth } from "./MiniMonth";
import { OccurrenceChoice, type OccurrenceScope } from "./OccurrenceChoice";
import { OverdueCounter } from "./OverdueCounter";
import { useCalendars } from "./useCalendars";

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

interface DayListProps {
  date: string;
  entries: DayEntry[];
  /** The entry whose details are open (its key). */
  openKey: string | null;
  onOpen: (entry: DayEntry) => void;
  onClose: () => void;
  /** Details next to the row (popover); false on phones, where the page shows them in a sheet. */
  inPopover: boolean;
  details: (entry: DayEntry) => ReactNode;
  /** Delete key on a row. */
  onDelete: (entry: DayEntry) => void;
}

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. A row opens the details card (click, tap, Enter / Space, right-click
// without the browser's menu): as a popover next to the row, or — on phones — in the page's sheet.
function DayList({ date, entries, openKey, onOpen, onClose, inPopover, details, onDelete }: DayListProps) {
  const { t, i18n } = useTranslation();
  const label = dayLabel(date, i18n.language);
  const byKey = (key: string | undefined) => entries.find((entry) => entry.key === key);
  const navigation = useListNavigation(
    entries.map((entry) => entry.key),
    null,
    {
      openLabel: "calendar.day.openDetails",
      deleteLabel: "shortcuts.listDeleteFocused",
      onOpen: (key) => {
        const entry = byKey(key);
        if (entry) onOpen(entry);
      },
      onDelete: ([key]) => {
        const entry = byKey(key);
        if (entry) onDelete(entry);
      },
    },
  );
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
    <ol
      aria-label={t("calendar.day.listLabel", { date: label })}
      className="flex flex-col gap-1.5 p-3 md:p-4"
      {...navigation.listProps}
    >
      {entries.map((entry) => {
        const row = (
          <button
            type="button"
            {...navigation.itemProps(entry.key)}
            aria-label={t("calendar.day.details", { title: entry.title || t("calendar.day.noTitle") })}
            aria-haspopup="dialog"
            aria-expanded={openKey === entry.key}
            onClick={
              inPopover
                ? undefined
                : () => {
                    onOpen(entry);
                  }
            }
            onContextMenu={(event) => {
              event.preventDefault();
              onOpen(entry);
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
        );
        return (
          <li key={entry.key} className={cn("rounded-sm text-[13px]", itemColorClasses(entry.color))}>
            {inPopover ? (
              <Popover
                open={openKey === entry.key}
                onOpenChange={(open) => {
                  if (open) onOpen(entry);
                  else onClose();
                }}
              >
                <PopoverTrigger asChild>{row}</PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  aria-label={t("calendar.details.title")}
                  className="max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
                >
                  {openKey === entry.key ? details(entry) : null}
                </PopoverContent>
              </Popover>
            ) : (
              row
            )}
          </li>
        );
      })}
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
  const [editing, setEditing] = useState<{ event: Record<string, unknown> | null; occurrence?: string } | null>(null);
  // +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. The entry whose details card is open.
  const [details, setDetails] = useState<DayEntry | null>(null);
  const calendars = useCalendars(user);
  // +++===+++ 2026-10-23 — Hasan Alizada — HAAL-065. The event waiting for the delete confirmation.
  const [deleting, setDeleting] = useState<Record<string, unknown> | null>(null);
  // +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. The "this occurrence or all?" question waiting for an answer.
  const [choice, setChoice] = useState<{ kind: "delete" | "edit"; row: Record<string, unknown>; date: string } | null>(
    null,
  );
  // After the confirmation closes the focus returns to the list — once a deleted row has left it ("" = cancelled).
  const refocus = useRef<string | null>(null);
  const titleOf = (row: Record<string, unknown>) =>
    typeof row.title === "string" && row.title !== "" ? row.title : t("calendar.day.noTitle");
  const requestDelete = (row: Record<string, unknown>, date: string) => {
    if (!calendars.canWrite(row.container_id)) {
      notify.info(t("calendar.delete.viewOnly"));
      return;
    }
    setDetails(null);
    if (row.rrule) setChoice({ kind: "delete", row, date });
    else setDeleting(row);
  };
  const requestEdit = (row: Record<string, unknown>, date: string) => {
    setDetails(null);
    if (row.rrule) setChoice({ kind: "edit", row, date });
    else setEditing({ event: row });
  };
  async function excludeOccurrence(row: Record<string, unknown>, date: string): Promise<boolean> {
    if (!user) return false;
    const id = String(row.id);
    const values = { title: titleOf(row), date: dayLabel(date, i18n.language) };
    const result = await runWrite({
      name: "occurrence_delete",
      run: () => mutate(user, { entity_type: "item", entity_id: id, op: "exclude", data: { occurrence_date: date } }),
      success: t("calendar.occurrence.deleted", values),
      undo: () => newStep("event.exclude", { key: "undo.labels.occurrenceDeleted", values }, { user, id, date }),
    });
    return result.ok;
  }
  async function answer(scope: OccurrenceScope) {
    if (!choice) return;
    const { kind, row, date } = choice;
    if (kind === "edit") {
      setChoice(null);
      setEditing(scope === "this" ? { event: row, occurrence: date } : { event: row });
      return;
    }
    const ok = scope === "this" ? await excludeOccurrence(row, date) : await deleteEvent(row);
    if (ok) {
      refocus.current = String(row.id);
      setChoice(null);
    }
  }
  async function deleteEvent(row: Record<string, unknown>): Promise<boolean> {
    if (!user) return false;
    const id = String(row.id);
    const title = titleOf(row);
    const version = typeof row.version === "number" ? { base_version: row.version } : {};
    const result = await runWrite({
      name: "event_delete",
      run: () => mutate(user, { entity_type: "item", entity_id: id, op: "delete", ...version }),
      success: t("calendar.delete.done", { title }),
      undo: () => newStep("event.delete", { key: "undo.labels.eventDeleted", values: { title } }, { user, id }),
    });
    if (result.ok) {
      refocus.current = id;
      setDeleting(null);
    }
    return result.ok;
  }
  const occurrenceOf = (entry: DayEntry) => entry.key.slice(entry.key.lastIndexOf(":") + 1);
  const detailsOf = (entry: DayEntry) => {
    const row = rows.find((candidate) => candidate.id === entry.id);
    if (!row || !user) return null;
    const calendar = calendars.byId.get(String(row.container_id));
    return (
      <EventDetails
        user={user}
        row={row}
        occurrence={occurrenceOf(entry)}
        calendarName={typeof calendar?.name === "string" ? calendar.name : null}
        writable={calendars.canWrite(row.container_id)}
        onEdit={() => {
          requestEdit(row, occurrenceOf(entry));
        }}
        onDelete={() => {
          requestDelete(row, occurrenceOf(entry));
        }}
      />
    );
  };
  useEffect(() => {
    const id = refocus.current;
    const asking = deleting !== null || choice !== null;
    if (asking || id === null || (id !== "" && entries.some((entry) => entry.id === id))) return;
    refocus.current = null;
    document.querySelector<HTMLElement>('[data-nav-id][tabindex="0"]')?.focus();
  }, [deleting, choice, entries]);
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
    enabled: editing === null && details === null && deleting === null && choice === null,
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
    <>
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
      <OverdueCounter rows={rows} viewerTz={viewerTz} />
    </>
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
            openKey={details?.key ?? null}
            inPopover={tablet}
            onOpen={setDetails}
            onClose={() => {
              setDetails(null);
            }}
            details={detailsOf}
            onDelete={(entry) => {
              const row = rows.find((candidate) => candidate.id === entry.id);
              if (row) requestDelete(row, occurrenceOf(entry));
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
      {!tablet ? (
        <Dialog
          open={details !== null}
          onOpenChange={(open) => {
            if (!open) setDetails(null);
          }}
        >
          {details ? (
            <DialogContent title={t("calendar.details.title")} closeLabel={t("common.close")}>
              {detailsOf(details)}
            </DialogContent>
          ) : null}
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t("calendar.delete.title")}
        body={deleting ? t("calendar.delete.body", { title: titleOf(deleting) }) : ""}
        confirmLabel={t("calendar.delete.confirm")}
        danger
        focusConfirm
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onConfirm={async () => {
          if (deleting) await deleteEvent(deleting);
        }}
        onClose={() => {
          refocus.current = "";
          setDeleting(null);
        }}
      />
      <OccurrenceChoice
        open={choice !== null}
        title={t(choice?.kind === "edit" ? "calendar.occurrence.editTitle" : "calendar.occurrence.deleteTitle")}
        body={
          choice
            ? t(choice.kind === "edit" ? "calendar.occurrence.editBody" : "calendar.occurrence.deleteBody", {
                title: titleOf(choice.row),
                date: dayLabel(choice.date, i18n.language),
              })
            : ""
        }
        thisLabel={t(choice?.kind === "edit" ? "calendar.occurrence.editThis" : "calendar.occurrence.deleteThis")}
        allLabel={t(choice?.kind === "edit" ? "calendar.occurrence.editAll" : "calendar.occurrence.deleteAll")}
        danger={choice?.kind !== "edit"}
        onChoose={answer}
        onClose={() => {
          refocus.current = "";
          setChoice(null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      />
      {editing ? (
        <EventEditor
          date={date}
          event={editing.event}
          {...(editing.occurrence ? { occurrence: editing.occurrence } : {})}
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
