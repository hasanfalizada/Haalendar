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
// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-080. "Show" in the editor's duplicate warning goes to that event's day
// and opens its details card.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. Move to next day (FR-CAL-20, D-73) from the details card and for a
// selection (FR-X-07, D-41): a checkbox per row, Ctrl/Cmd+click, Shift+click range, Ctrl/Cmd+A, Esc, long press on
// touch; a plain click still opens the card. The bar offers the move when every selected event is writable. Changing
// the day clears the selection.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-087. Views Day and Week (FR-CAL-25, D-75): a switch in the header and the
// keys D / W; the view is in the URL (`?view=`) and remembered on this device for the next visit. In the week view
// ‹ › and ← / → move by a week, the title is the week's range, the Day Number is left out (it belongs to one day) and
// the content is the week grid (WeekView); the selection of the day list does not apply there.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. Month view (FR-CAL-26, D-76): key M; ‹ › and ← / → move by a month
// keeping the day of month (the last day when the month is shorter); title "October 2026"; no Day Number; the content
// is the month grid (MonthView), whose days open the day view.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Agenda (FR-CAL-27, D-77): key A; the range is the selected date and
// the user's agenda days after it, ‹ › and ← / → move by that range; the title is the range; the content is the
// agenda list (AgendaView), whose day headings open the day view. A header narrower than 64 rem shows New event as an
// icon, so the four-view switch and range titles stay on one line.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Drag and drop in the week and month grids (FR-CAL-28, D-78): only
// events the user may change; a series first asks "only this occurrence or all?" (this and following: HAAL-093). The
// move is written like every event change and is one undo step; the notification names the new day and time.
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, PanelLeft, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { meQuery } from "@/api/session";
import { runWrite } from "@/api/write";
import { Button } from "@/components/ui/button";
import { BulkBar } from "@/components/ui/bulk-bar";
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
import { useAttachmentCounts, useRowFlags } from "@/lib/eventRow";
import { useListNavigation } from "@/lib/useListNavigation";
import { DESKTOP_UP, TABLET_UP, useMediaQuery } from "@/lib/useMediaQuery";
import { type Selection, useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { CALENDAR_VIEWS, type CalendarViewKind, storeView } from "@/lib/calendarView";
import { agendaDays } from "@/lib/agendaView";
import { type DropTarget, type EventTimes, droppedTimes, planDrop } from "@/lib/eventDrag";
import { addMonths, monthOf, sameDayIn } from "@/lib/monthGrid";
import { monthTitle, monthWeeks } from "@/lib/monthView";
import { weekDays, rangeTitle } from "@/lib/weekView";
import { localKeys, localRows, mutate } from "@/sync";

import { DayNumberLabel, IsoWeekLabel, LiveClock, WeekAbBadge } from "./HeaderInfo";
import { AgendaList } from "./AgendaView";
import { MonthGrid } from "./MonthView";
import { WeekGrid } from "./WeekView";
import type { DragData } from "./EventButton";
import { EventDetails } from "./EventDetails";
import { EventRowBody } from "./EventRow";
import { EventEditor } from "./EventEditor";
import { MiniMonth } from "./MiniMonth";
import { moveToNextDay, runMoves } from "./moveNextDay";
import { OccurrenceChoice, type OccurrenceScope } from "./OccurrenceChoice";
import { OverdueCounter } from "./OverdueCounter";
import { useCalendars } from "./useCalendars";

const SIDEBAR_KEY = "haalendar.calendar.sidebar";
function ViewSwitch({ view, onChange }: { view: CalendarViewKind; onChange: (view: CalendarViewKind) => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t("calendar.views.label")}
      className="inline-flex overflow-hidden rounded-sm border border-line"
    >
      {CALENDAR_VIEWS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === view}
          onClick={() => {
            onChange(option);
          }}
          className={cn(
            "h-11 border-r border-line px-3 text-[13px] last:border-r-0 md:px-2.5 pointer-fine:md:h-8",
            option === view ? "bg-primary-tint font-semibold text-primary" : "hover:bg-surface",
          )}
        >
          {t(`calendar.views.${option}`)}
        </button>
      ))}
    </div>
  );
}

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

interface DayListProps {
  /** The signed-in user (local database of attachments). */
  user: string | undefined;
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
  selection: Selection;
  /** Every selected event may be changed (the bar offers the move). */
  canMoveSelected: boolean;
  moving: boolean;
  onMoveSelected: () => void;
}

// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. A row opens the details card (click, tap, Enter / Space, right-click
// without the browser's menu): as a popover next to the row, or — on phones — in the page's sheet.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-083, D-72 / HAAL-089. Attachment counts and the row's inside are shared
// with the agenda (lib/eventRow, EventRow).
function DayList({
  user,
  date,
  entries,
  openKey,
  onOpen,
  onClose,
  inPopover,
  details,
  onDelete,
  selection,
  canMoveSelected,
  moving,
  onMoveSelected,
}: DayListProps) {
  const { t, i18n } = useTranslation();
  // A long press on touch selects; the context menu it also raises must not open the card.
  const pointer = useRef("mouse");
  const label = dayLabel(date, i18n.language);
  const attachmentCounts = useAttachmentCounts(user);
  const rowFlags = useRowFlags();
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
    <>
      <BulkBar
        selection={selection}
        total={entries.length}
        actions={canMoveSelected ? ["move_next_day"] : []}
        busy={moving}
        onAction={onMoveSelected}
        className="px-3 md:px-4"
      />
      <ol
        aria-label={t("calendar.day.listLabel", { date: label })}
        className="flex flex-col gap-1.5 p-3 md:p-4"
        {...navigation.listProps}
      >
        {entries.map((entry) => {
          const attachments = attachmentCounts.get(entry.id) ?? 0;
          // The row's name stays "Details of <title>"; what the icons show is its accessible description (D-72).
          const flags = rowFlags(entry, attachments);
          const flagsId = `day-row-flags-${entry.key}`;
          const selected = selection.isSelected(entry.key);
          const selectProps = selection.rowProps(
            entry.key,
            inPopover
              ? undefined
              : () => {
                  onOpen(entry);
                },
          );
          const row = (
            <button
              type="button"
              {...navigation.itemProps(entry.key)}
              {...selectProps}
              onPointerDown={(event) => {
                pointer.current = event.pointerType;
                selectProps.onPointerDown(event);
              }}
              aria-label={t("calendar.day.details", { title: entry.title || t("calendar.day.noTitle") })}
              aria-describedby={flags.length > 0 ? flagsId : undefined}
              aria-haspopup="dialog"
              aria-expanded={openKey === entry.key}
              onContextMenu={(event) => {
                event.preventDefault();
                if (pointer.current !== "touch") onOpen(entry);
              }}
              className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-sm py-2 pr-3 pl-1 text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <EventRowBody entry={entry} attachments={attachments} flags={flags} flagsId={flagsId} />
            </button>
          );
          return (
            <li
              key={entry.key}
              className={cn(
                "flex items-start rounded-sm text-[13px]",
                itemColorClasses(entry.color),
                selected && "ring-2 ring-primary",
              )}
            >
              <input
                type="checkbox"
                className="mt-2.5 ml-3 size-4 shrink-0"
                aria-label={t("calendar.day.select", { title: entry.title || t("calendar.day.noTitle") })}
                checked={selected}
                // A prevented click on a controlled checkbox leaves the box drawn in its old state; Shift comes from
                // the click that changed it.
                onChange={(event) => {
                  selection.toggle(entry.key, { range: (event.nativeEvent as MouseEvent).shiftKey });
                }}
              />
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
    </>
  );
}

export function DayView({
  date,
  view = "day",
  focusEvent,
}: {
  date: string;
  view?: CalendarViewKind;
  /** HAAL-091: an event whose details card opens once it is among the date's events (then leaves the URL). */
  focusEvent?: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const viewerTz = useDisplayTimeZone();
  const { week_start: weekStart, agenda_days: agendaLength, time_format: timeFormat } = useSettings();
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
  const week = view === "week";
  const month = view === "month";
  const agenda = view === "agenda";
  const days = useMemo(() => weekDays(date, weekStart), [date, weekStart]);
  const weeks = useMemo(() => monthWeeks(monthOf(date), weekStart), [date, weekStart]);
  const agendaRange = useMemo(() => agendaDays(date, agendaLength), [date, agendaLength]);
  const title = week
    ? rangeTitle(days, i18n.language)
    : month
      ? monthTitle(monthOf(date), i18n.language)
      : agenda
        ? rangeTitle(agendaRange, i18n.language)
        : dateTitle(date, today, i18n.language, t("calendar.header.today"));
  const weekday = view === "day" ? weekdayName(date, i18n.language) : null;
  /** The date one period (day, week, month or agenda range) before or after `from`. */
  const shift = (from: string, direction: 1 | -1) =>
    month
      ? sameDayIn(from, addMonths(monthOf(from), direction))
      : addDays(from, direction * (week ? 7 : agenda ? agendaLength : 1));
  const showsToday = week
    ? days.includes(today)
    : month
      ? monthOf(today) === monthOf(date)
      : agenda
        ? agendaRange.includes(today)
        : date === today;
  const navLabel = (direction: "previous" | "next") =>
    week
      ? (`calendar.nav.${direction}Week` as const)
      : month
        ? (`calendar.nav.${direction}Month` as const)
        : agenda
          ? (`calendar.nav.${direction}Range` as const)
          : (`calendar.nav.${direction}Day` as const);

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
  const [choice, setChoice] = useState<{
    kind: "delete" | "edit" | "move";
    row: Record<string, unknown>;
    date: string;
    /** move: where the dropped occurrence lands. */
    drop?: { next: EventTimes; target: DropTarget };
  } | null>(null);
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
    const { kind, row, date, drop } = choice;
    if (kind === "move") {
      setChoice(null);
      if (drop) await applyDrop(row, date, drop.next, drop.target, scope);
      return;
    }
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
  async function applyDrop(
    row: Record<string, unknown>,
    occurrence: string,
    next: EventTimes,
    target: DropTarget,
    scope: OccurrenceScope,
  ): Promise<void> {
    if (!user) return;
    const title = titleOf(row);
    const day = dayLabel(target.day, i18n.language);
    const where =
      target.minutes === undefined
        ? day
        : t("calendar.drag.at", {
            day,
            time: clockText(
              `${String(Math.floor(target.minutes / 60)).padStart(2, "0")}:${String(target.minutes % 60).padStart(2, "0")}`,
              i18n.language,
              timeFormat,
            ),
          });
    await runMoves(
      user,
      [{ plan: planDrop(row, occurrence, next, scope), title }],
      t("calendar.drag.moved", { title, where }),
      { key: "undo.labels.eventMovedTo", values: { title, where } },
    );
  }
  function dropEvent(data: DragData, target: DropTarget) {
    const row = rowOf(data.entry);
    if (!row || !calendars.canWrite(row.container_id)) return;
    const occurrence = occurrenceOf(data.entry);
    const next = droppedTimes(row, occurrence, data.day, target, viewerTz);
    if (!next) return;
    if (row.rrule) setChoice({ kind: "move", row, date: occurrence, drop: { next, target } });
    else void applyDrop(row, occurrence, next, target, "this");
  }
  const canDrag = (entry: DayEntry) => calendars.canWrite(rowOf(entry)?.container_id);
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
  const rowOf = (entry: DayEntry) => rows.find((candidate) => candidate.id === entry.id);
  const selection = useSelection(view === "day" ? entries.map((entry) => entry.key) : [], {
    selectAllShortcut: view === "day",
  });
  const { clear: clearSelection } = selection;
  useEffect(() => {
    clearSelection();
  }, [date, view, clearSelection]);
  const selectedEntries = entries.filter((entry) => selection.isSelected(entry.key));
  const canMoveSelected = selectedEntries.every((entry) => calendars.canWrite(rowOf(entry)?.container_id));
  const [moving, setMoving] = useState(false);
  async function moveSelected() {
    if (!user || moving) return;
    const targets = selectedEntries.flatMap((entry) => {
      const row = rowOf(entry);
      return row ? [{ row, occurrence: occurrenceOf(entry) }] : [];
    });
    setMoving(true);
    const ok = await moveToNextDay(user, targets);
    setMoving(false);
    if (ok) clearSelection();
  }
  async function moveOne(row: Record<string, unknown>, occurrence: string) {
    if (!user) return;
    setDetails(null);
    if (await moveToNextDay(user, [{ row, occurrence }])) refocus.current = String(row.id);
  }
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
        onMoveNextDay={() => {
          void moveOne(row, occurrenceOf(entry));
        }}
      />
    );
  };
  // The card of `focusEvent` opens once its entry is known (state adjusted while rendering, as for the editor's form).
  const [focused, setFocused] = useState<string | null>(null);
  if (focusEvent && focused !== focusEvent) {
    const entry = entries.find((candidate) => candidate.id === focusEvent);
    if (entry) {
      setFocused(focusEvent);
      setDetails(entry);
    }
  }
  useEffect(() => {
    if (focusEvent && focused === focusEvent) {
      void navigate({ to: "/calendar", search: { date, view }, replace: true });
    }
  }, [focusEvent, focused, navigate, date, view]);
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
    (target: string, nextView: CalendarViewKind = view) => {
      void navigate({ to: "/calendar", search: { date: target, view: nextView }, replace: true });
    },
    [navigate, view],
  );
  const switchView = (next: CalendarViewKind, day: string = current()) => {
    storeView(next);
    go(day, next);
  };
  useShortcut({
    id: "calendar:previous-day",
    keys: ["Left"],
    group: "navigation",
    label: navLabel("previous"),
    handler: () => {
      go(shift(current(), -1));
    },
  });
  useShortcut({
    id: "calendar:next-day",
    keys: ["Right"],
    group: "navigation",
    label: navLabel("next"),
    handler: () => {
      go(shift(current(), 1));
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
    id: "calendar:view-day",
    keys: ["D"],
    group: "navigation",
    label: "calendar.views.dayKey",
    handler: () => {
      switchView("day");
    },
  });
  useShortcut({
    id: "calendar:view-week",
    keys: ["W"],
    group: "navigation",
    label: "calendar.views.weekKey",
    handler: () => {
      switchView("week");
    },
  });
  useShortcut({
    id: "calendar:view-month",
    keys: ["M"],
    group: "navigation",
    label: "calendar.views.monthKey",
    handler: () => {
      switchView("month");
    },
  });
  useShortcut({
    id: "calendar:view-agenda",
    keys: ["A"],
    group: "navigation",
    label: "calendar.views.agendaKey",
    handler: () => {
      switchView("agenda");
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
        <div className="@container flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-2 py-1.5 md:px-4">
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
              {weekday ? <span className="text-[13px] text-muted">{weekday}</span> : null}
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
              aria-label={t(navLabel("previous"))}
              onClick={() => {
                go(shift(date, -1));
              }}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              disabled={showsToday}
              onClick={() => {
                go(today);
              }}
            >
              {t("calendar.nav.today")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(navLabel("next"))}
              onClick={() => {
                go(shift(date, 1));
              }}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <div className="flex w-full items-center gap-3 text-xs text-muted max-md:order-last md:ml-auto md:w-auto md:text-[13px]">
            <LiveClock timeZone={viewerTz} />
            <IsoWeekLabel date={date} />
            <WeekAbBadge date={date} />
            {view === "day" ? <DayNumberLabel date={date} /> : null}
          </div>
          <div className="max-md:ml-auto">
            <ViewSwitch view={view} onChange={switchView} />
          </div>
          {tablet ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing({ event: null });
              }}
            >
              <Plus aria-hidden />
              {/* A narrow header (sidebar open, long range title) keeps the button on the line as an icon. */}
              <span className="@max-[64rem]:sr-only">{t("calendar.editor.newButton")}</span>
            </Button>
          ) : null}
        </div>
        {agenda ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AgendaList
              key={`${date}:${String(agendaLength)}`}
              user={user}
              days={agendaRange}
              rows={rows}
              viewerTz={viewerTz}
              today={today}
              anchor={{
                openKey: details?.key ?? null,
                onOpen: setDetails,
                onClose: () => {
                  setDetails(null);
                },
                inPopover: tablet,
                details: detailsOf,
              }}
              onDay={(day) => {
                switchView("day", day);
              }}
            />
          </div>
        ) : month ? (
          <div className="min-h-0 flex-1">
            <MonthGrid
              weeks={weeks}
              month={monthOf(date)}
              date={date}
              today={today}
              rows={rows}
              viewerTz={viewerTz}
              anchor={{
                openKey: details?.key ?? null,
                onOpen: setDetails,
                onClose: () => {
                  setDetails(null);
                },
                inPopover: tablet,
                details: detailsOf,
              }}
              compact={!tablet}
              onDay={(day) => {
                switchView("day", day);
              }}
              canDrag={canDrag}
              onDrop={dropEvent}
            />
          </div>
        ) : week ? (
          <div className="min-h-0 flex-1">
            <WeekGrid
              days={days}
              rows={rows}
              viewerTz={viewerTz}
              today={today}
              openKey={details?.key ?? null}
              inPopover={tablet}
              onOpen={setDetails}
              onClose={() => {
                setDetails(null);
              }}
              details={detailsOf}
              canDrag={canDrag}
              onDrop={dropEvent}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DayList
              user={user}
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
              selection={selection}
              canMoveSelected={canMoveSelected}
              moving={moving}
              onMoveSelected={() => {
                void moveSelected();
              }}
            />
          </div>
        )}
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
      {/* The selection bar sits at the bottom on phones; the new-event button would cover it. */}
      {!tablet && selection.count === 0 ? (
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
        title={t(
          choice?.kind === "edit"
            ? "calendar.occurrence.editTitle"
            : choice?.kind === "move"
              ? "calendar.occurrence.moveTitle"
              : "calendar.occurrence.deleteTitle",
        )}
        body={
          choice
            ? t(
                choice.kind === "edit"
                  ? "calendar.occurrence.editBody"
                  : choice.kind === "move"
                    ? "calendar.occurrence.moveBody"
                    : "calendar.occurrence.deleteBody",
                { title: titleOf(choice.row), date: dayLabel(choice.date, i18n.language) },
              )
            : ""
        }
        thisLabel={t(choice?.kind === "delete" ? "calendar.occurrence.deleteThis" : "calendar.occurrence.editThis")}
        allLabel={t(choice?.kind === "delete" ? "calendar.occurrence.deleteAll" : "calendar.occurrence.editAll")}
        danger={choice?.kind === "delete"}
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
          onShowEvent={(id, day) => {
            go(day);
            setDetails(entriesOn(rows, day, viewerTz).find((entry) => entry.id === id) ?? null);
          }}
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
