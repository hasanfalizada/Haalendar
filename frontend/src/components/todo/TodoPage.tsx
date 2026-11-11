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
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, ListChecks, ListPlus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Priority } from "@/atoms/items/priority";
import { meQuery } from "@/api/session";
import type { Color, Priority as ItemPriority } from "@/api/generated/types.gen";
import { runItemBulk } from "@/components/shared/itemBulk";
import { Button } from "@/components/ui/button";
import { type BarAction, BulkBar } from "@/components/ui/bulk-bar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PriorityFilter } from "@/components/ui/priority";
import { checklistOf } from "@/lib/checklist";
import { useAttachmentCounts } from "@/lib/eventRow";
import { type NoteAccess, type NotesTab, isNote, noteAccess, noteGroups, notePositions } from "@/lib/notes";
import { atLabel, nextReminder } from "@/lib/reminders";
import { useNow } from "@/lib/useNow";
import { useDisplayTimeZone } from "@/lib/datetime";
import { useSettings } from "@/api/settings";
import { formatPriorityParam } from "@/lib/priority";
import { TABLET_UP, useMediaQuery } from "@/lib/useMediaQuery";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";

import { NoteCard } from "./NoteCard";
import { NoteEditor } from "./NoteEditor";

type Row = Record<string, unknown>;

const TABS: readonly NotesTab[] = ["notes", "archive"];

interface TodoPageProps {
  tab: NotesTab;
  priorities: Priority[];
  /** A note to open (from its reminder). */
  focusNote?: string;
}

export function TodoPage({ tab, priorities, focusNote }: TodoPageProps) {
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
  const accessOf = (row: Row): NoteAccess => noteAccess(row, user, shareRows);
  const attachments = useAttachmentCounts(user);
  const now = useNow();
  const viewerTz = useDisplayTimeZone();
  const { time_format: timeFormat } = useSettings();
  const reminderText = (noteId: string) => {
    const next = nextReminder(reminderRows, noteId, now);
    return next ? atLabel(next, viewerTz, timeFormat, now) : null;
  };
  const groups = useMemo(() => noteGroups(rows, tab, priorities, user), [rows, tab, priorities, user]);
  const positions = useMemo(() => notePositions(rows), [rows]);
  const shown = useMemo(() => [...groups.pinned, ...groups.others, ...groups.shared], [groups]);
  const selection = useSelection(
    shown.map((row) => String(row.id)),
    { selectAllShortcut: true },
  );
  const { clear: clearSelection } = selection;
  useEffect(() => {
    clearSelection();
  }, [tab, priorities, clearSelection]);
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
  if (focusNote && focusNote !== focused) {
    const target = rows.find((row) => row.id === focusNote && isNote(row));
    if (target) {
      setFocused(focusNote);
      setEditing(target);
    }
  }

  const go = (next: { tab?: NotesTab; priorities?: Priority[] }) => {
    const nextTab = next.tab ?? tab;
    void navigate({
      to: "/todo",
      search: {
        tab: nextTab === "archive" ? "archive" : undefined,
        priority: formatPriorityParam(next.priorities ?? priorities),
        note: undefined,
      },
      replace: true,
    });
  };
  // "Others" gets its heading when another section is shown too.
  const headed = groups.pinned.length > 0 || groups.shared.length > 0;
  const nothing = groups.pinned.length === 0 && groups.others.length === 0 && groups.shared.length === 0;
  const filtered = priorities.length > 0;

  const grid = (notes: Row[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] items-start gap-3">
      {notes.map((row) => (
        <li key={String(row.id)} className="contents">
          <NoteCard
            user={user}
            row={row}
            attachments={attachments.get(String(row.id)) ?? 0}
            checklist={row.is_checklist === true ? checklistOf(itemRows, String(row.id)) : null}
            nextReminder={reminderText(String(row.id))}
            access={accessOf(row)}
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
        <div className="ml-auto flex items-center gap-2">
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
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:p-4">
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
          <div className="flex flex-col gap-5">
            {groups.pinned.length > 0 ? (
              <section aria-labelledby="notes-pinned" className="flex flex-col gap-2">
                <h2 id="notes-pinned" className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {t("todo.groups.pinned")}
                </h2>
                {grid(groups.pinned)}
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
                {grid(groups.others)}
              </section>
            ) : null}
            {groups.shared.length > 0 ? (
              <section aria-labelledby="notes-shared" className="flex flex-col gap-2">
                <h2 id="notes-shared" className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {t("todo.groups.shared")}
                </h2>
                {grid(groups.shared)}
              </section>
            ) : null}
          </div>
        )}
      </div>

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
      {editing && user ? (
        <NoteEditor
          user={user}
          note={editingRow}
          positions={positions}
          asList={editing === "list"}
          access={editingRow ? accessOf(editingRow) : "owner"}
          onClose={() => {
            setEditing(null);
            if (focusNote) go({});
          }}
        />
      ) : null}
    </div>
  );
}
