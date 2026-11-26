// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The To-Do page (FR-TODO-01/03, D-87): the user's notes from the local
// database (offline too, following sync and live updates). Tabs Notes / Archive (`?tab=archive`), the priority filter
// (`?priority=`, FR-X-12), New note (in the header from tablets, a floating button on phones). Notes are cards in a
// grid: Pinned first, then Others, each by position — a new note goes on top (manual order and list layout: HAAL-103).
// The archive shows the archived notes only; an empty page invites the first note.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Checklists on the cards and "New list" next to New note (D-88).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. The cards show the next reminder (D-89); `focusNote` (from a
// reminder) opens that note once it is in the local database, whichever tab it is on.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. The minute clock moved to lib/useNow (the board's cards use it too).
// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F6). Multi-select of the shown notes (FR-X-07, D-41) with
// the bulk bar: colour, priority and delete for all of them as one action (components/shared/itemBulk); Ctrl/Cmd+A
// selects every shown note, Esc clears; changing the tab or the filter clears the selection.
// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F7). Notes shared with the user (FR-ACC-10) in their own
// section "Shared with me"; the bar offers only what every selected note allows (delete: own notes only; colour and
// priority: own notes or an edit share).
// +++===+++ 2026-11-17 22:40 +04 — Hasan Alizada — HAAL-102. The user's personal labels (FR-TODO-04, D-109): chips on the
// cards, a Labels menu next to the priority filter — the notes with any of the checked labels (`?labels=`, on both
// tabs, together with the priority) — and Manage labels at its end.
// +++===+++ 2026-11-18 15:40 +04 — Hasan Alizada — HAAL-103. Grid or list (FR-TODO-05, D-110): a Grid | List switch in
// the header, the user setting `note_layout` (all devices). Manual order: the user's own notes move within their section
// (Pinned, Others, the archive) by the handle or Alt+arrows (NoteCard), among the notes shown when a filter is on; each
// move is one update of the note's position with a notification and one undo step, told to screen readers; a note moved
// from the keyboard keeps the focus. Notes shared with the user keep their owner's order and do not move.
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, LayoutGrid, List, ListChecks, ListPlus, Plus, Tags } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Priority } from "@/atoms/items/priority";
import { meQuery } from "@/api/session";
import type { Color, Priority as ItemPriority } from "@/api/generated/types.gen";
import { runItemBulk } from "@/components/shared/itemBulk";
import { Button } from "@/components/ui/button";
import { type BarAction, BulkBar } from "@/components/ui/bulk-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityFilter } from "@/components/ui/priority";
import { SearchField } from "@/components/search/SearchField";
import { dueState } from "@/lib/cards";
import { checklistOf } from "@/lib/checklist";
import { useAttachmentCounts } from "@/lib/eventRow";
import {
  type NoteAccess,
  type NoteLayout,
  type NoteSection,
  type NotesTab,
  dropIndex,
  filterByLabels,
  formatLabelsParam,
  isNote,
  labelsByNote,
  movedPosition,
  noteAccess,
  noteGroups,
  notePositions,
  personalLabels,
  stepIndex,
} from "@/lib/notes";
import { swatchClasses } from "@/lib/palette";
import { atLabel, nextReminder } from "@/lib/reminders";
import { useNow } from "@/lib/useNow";
import { useDisplayTimeZone } from "@/lib/datetime";
import { useSettings } from "@/api/settings";
import { dropZoneUnderPointer } from "@/lib/dropZone";
import { formatPriorityParam } from "@/lib/priority";
import { useShortcut } from "@/lib/shortcuts";
import { TABLET_UP, useMediaQuery } from "@/lib/useMediaQuery";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";

import { NoteCard, type NoteDragData } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";
import { NoteLabelsDialog } from "./NoteLabelsDialog";
import { setNoteLayout } from "./noteLayout";
import { noteName, updateNote } from "./noteWrites";

type Row = Record<string, unknown>;

const TABS: readonly NotesTab[] = ["notes", "archive"];
const LAYOUTS: readonly { value: NoteLayout; Icon: typeof LayoutGrid }[] = [
  { value: "grid", Icon: LayoutGrid },
  { value: "list", Icon: List },
];
const NO_PRIORITIES: Priority[] = [];

interface TodoPageProps {
  tab: NotesTab;
  priorities: Priority[];
  /** The ids of the labels to filter by (any of them). */
  labelFilter?: string[];
  /** A note to open (from its reminder). */
  focusNote?: string;
  /** HAAL-123: the editor of a new note or list opens with this title, then the request leaves the URL. */
  createNote?: { list: boolean; title: string };
}

const NO_LABELS: string[] = [];

export function TodoPage({ tab, priorities, labelFilter = NO_LABELS, focusNote, createNote }: TodoPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tablet = useMediaQuery(TABLET_UP);
  const { data: me } = useQuery(meQuery);
  const user = me?.id ?? "";
  const { data: rows = [] } = useQuery({
    queryKey: [...localKeys.table("item"), user],
    queryFn: () => (user ? localRows(user, "item") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: itemRows = [] } = useQuery({
    queryKey: [...localKeys.table("checklist_item"), user],
    queryFn: () => (user ? localRows(user, "checklist_item") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: reminderRows = [] } = useQuery({
    queryKey: [...localKeys.table("reminder"), user],
    queryFn: () => (user ? localRows(user, "reminder") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: shareRows = [] } = useQuery({
    queryKey: [...localKeys.table("share"), user],
    queryFn: () => (user ? localRows(user, "share") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: labelRows = [] } = useQuery({
    queryKey: [...localKeys.table("label"), user],
    queryFn: () => (user ? localRows(user, "label") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: itemLabelRows = [] } = useQuery({
    queryKey: [...localKeys.table("item_label"), user],
    queryFn: () => (user ? localRows(user, "item_label") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const labels = useMemo(() => personalLabels(labelRows, user), [labelRows, user]);
  const byNote = useMemo(() => labelsByNote(itemLabelRows, labels), [itemLabelRows, labels]);
  // The chosen labels that still exist: a deleted one no longer filters (nor counts).
  const chosenLabels = labels
    .filter((label) => labelFilter.includes(String(label.id)))
    .map((label) => String(label.id));
  const labelsOf = (noteId: string) => {
    const on = byNote.get(noteId) ?? [];
    return labels.filter((label) => on.includes(String(label.id)));
  };
  const [managing, setManaging] = useState(false);
  const accessOf = (row: Row): NoteAccess => noteAccess(row, user, shareRows);
  const attachments = useAttachmentCounts(user);
  const now = useNow();
  const viewerTz = useDisplayTimeZone();
  const { time_format: timeFormat, note_layout: layout } = useSettings();
  const client = useQueryClient();
  const reminderText = (noteId: string) => {
    const next = nextReminder(reminderRows, noteId, now);
    return next ? atLabel(next, viewerTz, timeFormat, now) : null;
  };
  const groups = useMemo(
    () => noteGroups(filterByLabels(rows, labelFilter, byNote, labels), tab, priorities, user),
    [rows, labelFilter, byNote, labels, tab, priorities, user],
  );
  const positions = useMemo(() => notePositions(rows), [rows]);
  // The sections without the filters: a move among the notes shown keeps the hidden ones in their places.
  const whole = useMemo(() => noteGroups(rows, tab, NO_PRIORITIES, user), [rows, tab, user]);
  const [dragging, setDragging] = useState<NoteDragData | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // The note moved from the keyboard gets the focus back once it is in its new place.
  const refocus = useRef<{ id: string; position: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const want = refocus.current;
    if (!want || rows.find((row) => row.id === want.id)?.position !== want.position) return;
    refocus.current = null;
    list.current?.querySelector<HTMLElement>(`[data-note="${want.id}"]`)?.focus();
  }, [rows]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  useShortcut({
    id: "todo:note-move",
    keys: ["Alt+Up", "Alt+Down", "Alt+Left", "Alt+Right"],
    group: "items",
    label: "todo.card.moveKeys",
  });
  const shown = useMemo(() => [...groups.pinned, ...groups.others, ...groups.shared], [groups]);
  const selection = useSelection(
    shown.map((row) => String(row.id)),
    { selectAllShortcut: true },
  );
  const { clear: clearSelection } = selection;
  useEffect(() => {
    clearSelection();
  }, [tab, priorities, labelFilter, clearSelection]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedRows = shown.filter((row) => selection.isSelected(String(row.id)));
  const selectedTargets = () => selectedRows.map((row) => ({ row }));
  const bulkActions: BarAction[] = [
    ...(selectedRows.every((row) => accessOf(row) !== "view") ? (["set_color", "set_priority"] as const) : []),
    ...(selectedRows.every((row) => accessOf(row) === "owner") ? (["delete"] as const) : []),
  ];
  async function bulk(action: BarAction, value?: Color | ItemPriority) {
    if (!user) return;
    if (action === "delete") {
      setConfirmDelete(true);
      return;
    }
    if (action !== "set_color" && action !== "set_priority") return;
    setBusy(true);
    await runItemBulk(user, action, selectedTargets(), value);
    setBusy(false);
  }
  // The note in the editor: a row, "new" (a note), "list" (a note with a checklist), or none.
  const [editing, setEditing] = useState<Row | "new" | "list" | null>(null);
  const editingRow =
    editing && typeof editing === "object" ? (rows.find((row) => row.id === editing.id) ?? editing) : null;
  // The note a reminder leads to opens once it has arrived (adjusted while rendering, not in an effect).
  const [focused, setFocused] = useState<string | null>(null);
  // +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The palette's new note or list: its editor, the title filled in.
  const createKey = createNote ? `${createNote.list ? "list" : "note"}:${createNote.title}` : null;
  const [created, setCreated] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  if (createKey !== created) {
    setCreated(createKey);
    if (createNote) {
      setNewTitle(createNote.title);
      setEditing(createNote.list ? "list" : "new");
    }
  }
  useEffect(() => {
    if (createKey !== null) {
      void navigate({
        to: "/todo",
        search: (previous) => ({ ...previous, new: undefined, title: undefined }),
        replace: true,
      });
    }
  }, [createKey, navigate]);
  if (focusNote && focusNote !== focused) {
    const target = rows.find((row) => row.id === focusNote && isNote(row));
    if (target) {
      setFocused(focusNote);
      setEditing(target);
    }
  }

  const go = (next: { tab?: NotesTab; priorities?: Priority[]; labels?: string[] }) => {
    const nextTab = next.tab ?? tab;
    void navigate({
      to: "/todo",
      search: {
        tab: nextTab === "archive" ? "archive" : undefined,
        priority: formatPriorityParam(next.priorities ?? priorities),
        labels: formatLabelsParam(next.labels ?? chosenLabels),
        note: undefined,
      },
      replace: true,
    });
  };
  // `index` counts the notes shown in the section, without the moved one.
  async function moveNote(row: Row, section: NoteSection, index: number | null, keepFocus = false) {
    if (index === null || !user) return;
    const shownSection = groups[section];
    const position = movedPosition(whole[section], shownSection, row, index);
    if (position === null) return;
    if (keepFocus) refocus.current = { id: String(row.id), position };
    const ok = await updateNote(user, row, "move", { position });
    if (!ok) {
      refocus.current = null;
      return;
    }
    setAnnouncement(t("todo.card.moved", { title: noteName(row), position: index + 1, total: shownSection.length }));
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const moving = active.data.current as NoteDragData | undefined;
    const target = over?.data.current as NoteDragData | undefined;
    if (!moving || !target || moving.section !== target.section) return;
    void moveNote(moving.row, moving.section, dropIndex(groups[moving.section], moving.row, target.row));
  }

  // "Others" gets its heading when another section is shown too.
  const headed = groups.pinned.length > 0 || groups.shared.length > 0;
  const nothing = groups.pinned.length === 0 && groups.others.length === 0 && groups.shared.length === 0;
  const filtered = priorities.length > 0 || chosenLabels.length > 0;

  // A section's notes; `section` when the user's own notes in it may be moved (not the shared ones).
  const grid = (notes: Row[], section: NoteSection | null) => (
    <ul
      className={cn(
        layout === "list"
          ? "flex max-w-3xl flex-col gap-2"
          : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] items-start gap-3",
      )}
    >
      {notes.map((row) => (
        <li key={String(row.id)} className="contents">
          <NoteCard
            user={user}
            row={row}
            layout={layout}
            move={
              section && notes.length > 1 && accessOf(row) === "owner"
                ? {
                    section,
                    onStep: (by) => {
                      void moveNote(row, section, stepIndex(notes, row, by), true);
                    },
                  }
                : undefined
            }
            attachments={attachments.get(String(row.id)) ?? 0}
            checklist={row.is_checklist === true ? checklistOf(itemRows, String(row.id)) : null}
            nextReminder={reminderText(String(row.id))}
            // +++===+++ 2026-11-23 22:10 +04 — Hasan Alizada — HAAL-104. An archived note is put away: its due date
            // stays, without the overdue / due-soon badge.
            dueState={row.archived_at ? null : dueState(row, viewerTz, now)}
            access={accessOf(row)}
            labels={labelsOf(String(row.id))}
            onOpen={() => {
              setEditing(row);
            }}
            select={{
              selected: selection.isSelected(String(row.id)),
              toggle: (range) => {
                selection.toggle(String(row.id), { range });
              },
              rowProps: selection.rowProps(String(row.id), () => {
                setEditing(row);
              }),
            }}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-2 py-1.5 md:px-4">
        <h1 className="text-lg font-semibold">{t("pages.todo.title")}</h1>
        <div
          role="radiogroup"
          aria-label={t("todo.tabs.label")}
          className="inline-flex overflow-hidden rounded-sm border border-line"
        >
          {TABS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === tab}
              onClick={() => {
                go({ tab: option });
              }}
              className={cn(
                "h-11 border-r border-line px-3 text-[13px] last:border-r-0 md:px-2.5 pointer-fine:md:h-8",
                option === tab ? "bg-primary-tint font-semibold text-primary" : "hover:bg-surface",
              )}
            >
              {t(`todo.tabs.${option}`)}
            </button>
          ))}
        </div>
        <PriorityFilter
          value={priorities}
          onChange={(next) => {
            go({ priorities: next });
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Tags aria-hidden />
              {chosenLabels.length > 0
                ? t("kanban.filters.labelsCount", { count: chosenLabels.length })
                : t("kanban.filters.labels")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {labels.length === 0 ? <DropdownMenuItem disabled>{t("todo.labels.none")}</DropdownMenuItem> : null}
            {labels.map((label) => {
              const id = String(label.id);
              return (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={chosenLabels.includes(id)}
                  onCheckedChange={(checked) => {
                    go({ labels: checked ? [...chosenLabels, id] : chosenLabels.filter((other) => other !== id) });
                  }}
                >
                  <span className={cn("size-2.5 rounded-full", swatchClasses(label.color as Color))} aria-hidden />
                  {String(label.name)}
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setManaging(true);
              }}
            >
              {t("todo.labels.manage")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div
          role="radiogroup"
          aria-label={t("todo.layout.label")}
          className="inline-flex overflow-hidden rounded-sm border border-line"
        >
          {LAYOUTS.map(({ value, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === layout}
              aria-label={t(`todo.layout.${value}`)}
              title={t(`todo.layout.${value}`)}
              onClick={() => {
                if (value !== layout && user) void setNoteLayout(client, user, value, layout);
              }}
              className={cn(
                "grid h-11 w-11 place-items-center border-r border-line last:border-r-0 pointer-fine:md:h-8 pointer-fine:md:w-8",
                value === layout ? "bg-primary-tint text-primary" : "hover:bg-surface",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* HAAL-039 (D-119): the search field; on phones it is in the top bar. */}
          <SearchField className="w-44 max-md:hidden" />
          <Button
            size={tablet ? "md" : "icon"}
            aria-label={tablet ? undefined : t("todo.newList")}
            onClick={() => {
              setEditing("list");
            }}
          >
            <ListPlus aria-hidden />
            {tablet ? t("todo.newList") : null}
          </Button>
          {/* On phones New note is the floating button. */}
          {tablet ? (
            <Button
              variant="primary"
              onClick={() => {
                setEditing("new");
              }}
            >
              <Plus aria-hidden />
              {t("todo.newButton")}
            </Button>
          ) : null}
        </div>
      </div>

      {nothing ? null : (
        <BulkBar
          selection={selection}
          total={shown.length}
          actions={bulkActions}
          busy={busy}
          onAction={(action, value) => {
            void bulk(action, value);
          }}
          className="px-3 md:px-4"
        />
      )}
      <div ref={list} className="relative min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:p-4">
        {nothing ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
                {tab === "archive" ? (
                  <Archive className="size-6" aria-hidden />
                ) : (
                  <ListChecks className="size-6" aria-hidden />
                )}
              </div>
              <h2 className="text-[15px] font-semibold">
                {filtered ? t("todo.empty.filtered") : t(`todo.empty.${tab}Title`)}
              </h2>
              {filtered ? null : <p className="text-muted">{t(`todo.empty.${tab}Body`)}</p>}
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            // The note under the pointer is the target, not the one the carried box overlaps most.
            collisionDetection={dropZoneUnderPointer}
            onDragStart={({ active }) => {
              setDragging((active.data.current as NoteDragData | undefined) ?? null);
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDragging(null);
            }}
            accessibility={{
              announcements: {
                onDragStart: ({ active }) =>
                  t("kanban.drag.picked", { name: noteName((active.data.current as NoteDragData).row) }),
                onDragOver: () => undefined,
                // The drop is told by the move itself (where the note went).
                onDragEnd: () => undefined,
                onDragCancel: ({ active }) =>
                  t("kanban.drag.cancelled", { name: noteName((active.data.current as NoteDragData).row) }),
              },
            }}
          >
            <div className="flex flex-col gap-5">
              {groups.pinned.length > 0 ? (
                <section aria-labelledby="notes-pinned" className="flex flex-col gap-2">
                  <h2 id="notes-pinned" className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {t("todo.groups.pinned")}
                  </h2>
                  {grid(groups.pinned, "pinned")}
                </section>
              ) : null}
              {groups.others.length > 0 ? (
                <section
                  aria-labelledby={headed ? "notes-others" : undefined}
                  aria-label={headed ? undefined : t(`todo.tabs.${tab}`)}
                  className="flex flex-col gap-2"
                >
                  {headed ? (
                    <h2 id="notes-others" className="text-xs font-semibold tracking-wide text-muted uppercase">
                      {t("todo.groups.others")}
                    </h2>
                  ) : null}
                  {grid(groups.others, "others")}
                </section>
              ) : null}
              {groups.shared.length > 0 ? (
                <section aria-labelledby="notes-shared" className="flex flex-col gap-2">
                  <h2 id="notes-shared" className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {t("todo.groups.shared")}
                  </h2>
                  {grid(groups.shared, null)}
                </section>
              ) : null}
            </div>
            <DragOverlay dropAnimation={null}>
              {dragging ? (
                <div className="w-60 rounded-md border border-primary bg-bg p-3 text-[13px] font-semibold wrap-anywhere shadow-lg">
                  {noteName(dragging.row)}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {!tablet ? (
        <Button
          variant="primary"
          size="icon"
          aria-label={t("todo.newButton")}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg"
          onClick={() => {
            setEditing("new");
          }}
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title={t("bulk.confirm.title", { count: selection.count })}
        body={t("bulk.confirm.body")}
        confirmLabel={t("bulk.confirm.delete")}
        danger
        focusConfirm
        onConfirm={async () => {
          if (!user) return;
          setBusy(true);
          const ok = await runItemBulk(user, "delete", selectedTargets());
          setBusy(false);
          setConfirmDelete(false);
          if (ok) clearSelection();
        }}
        onClose={() => {
          setConfirmDelete(false);
        }}
      />
      {managing && user ? (
        <NoteLabelsDialog
          user={user}
          labels={labels}
          itemLabels={itemLabelRows}
          onClose={() => {
            setManaging(false);
          }}
        />
      ) : null}
      {editing && user ? (
        <NoteEditor
          user={user}
          note={editingRow}
          positions={positions}
          asList={editing === "list"}
          {...(editingRow ? {} : { title: newTitle })}
          access={editingRow ? accessOf(editingRow) : "owner"}
          onClose={() => {
            setEditing(null);
            setNewTitle("");
            if (focusNote) go({});
          }}
        />
      ) : null}
    </div>
  );
}
