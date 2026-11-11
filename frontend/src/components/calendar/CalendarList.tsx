// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. The calendar list of the calendar sidebar (FR-CAL-32, D-82), under the
// mini month (tablet: the sliding panel; phone: the date sheet):
// - "My calendars": a checkbox shows or hides the calendar in the views (user setting), its colour and name ("default"
//   marked); the menu: Edit name and color…, Share… (the share dialog), Make default, Archive, Delete… (a confirmation
//   naming its events — they go to the trash with it); the default can be neither archived nor deleted;
// - "+ New calendar": name and colour;
// - "Shared with me": checkbox, the owner in the tooltip, Leave;
// - "Archived" (folded): Unarchive, Delete….
// Changes go through calendarWrites (sync with undo; hiding, sharing and leaving need a connection).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. "Import .ics…" for calendars the user may write to (own active
// ones, shared with "edit") and "Export .ics" for every calendar listed, archived ones too (D-83).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
import { type ReactNode, type SubmitEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { sharesQuery } from "@/api/sharing";
import { useShareActions } from "@/components/sharing/useShareActions";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { Button } from "@/components/ui/button";
import { ColorPicker, ColorSwatch } from "@/components/ui/color-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/input";

import { createCalendar, deleteCalendar, setDefaultCalendar, setHidden, updateCalendar } from "./calendarWrites";
import { IcsImportDialog } from "./IcsImportDialog";
import { downloadIcs } from "./icsDownload";
import type { CalendarRow, Calendars } from "./useCalendars";

const NAME_MAX = 100;

interface CalendarListProps {
  user: string;
  calendars: Calendars;
  /** All event rows of the local database (to count what a deleted calendar takes along). */
  items: readonly Record<string, unknown>[];
}

type Editing = { row: CalendarRow | null } | null;

export function CalendarList({ user, calendars, items }: CalendarListProps) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Editing>(null);
  const [sharing, setSharing] = useState<CalendarRow | null>(null);
  const [importing, setImporting] = useState<CalendarRow | null>(null);
  const [deleting, setDeleting] = useState<CalendarRow | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const shareActions = useShareActions();
  const received = useQuery({
    ...sharesQuery({ direction: "received", containerKind: "calendar" }),
    enabled: calendars.shared.length > 0,
  });
  const shareOf = (row: CalendarRow) => (received.data ?? []).find((share) => share.container_id === row.id);
  const name = (row: CalendarRow) => String(row.name);
  const eventsIn = (row: CalendarRow) =>
    items.filter((item) => item.container_id === row.id && !item.deleted_at).length;

  async function toggle(row: CalendarRow, show: boolean) {
    const id = String(row.id);
    setToggling(id);
    await setHidden(client, user, id, !show);
    setToggling(null);
  }

  const checkbox = (row: CalendarRow) => {
    const id = String(row.id);
    return (
      <input
        type="checkbox"
        className="size-4 shrink-0"
        checked={!calendars.hidden.has(id)}
        disabled={toggling === id}
        aria-label={t("calendars.show", { name: name(row) })}
        onChange={(e) => {
          void toggle(row, e.target.checked);
        }}
      />
    );
  };

  const menu = (row: CalendarRow, children: ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t("calendars.menu", { name: name(row) })}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );

  const line = (row: CalendarRow, toggleable: boolean, extra?: ReactNode, title?: string) => (
    <li key={String(row.id)} className="flex min-h-9 items-center gap-2" title={title}>
      {toggleable ? checkbox(row) : null}
      <ColorSwatch color={row.color as Color} className="size-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {name(row)}
        {row.is_default === true ? <span className="ml-1 text-xs text-muted">{t("calendars.defaultMark")}</span> : null}
      </span>
      {extra}
    </li>
  );

  const heading = "text-[11px] font-semibold tracking-wider text-muted uppercase";

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-line pt-3">
      <section aria-labelledby="calendars-own" className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 id="calendars-own" className={heading}>
            {t("calendars.own")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("calendars.new")}
            title={t("calendars.new")}
            onClick={() => {
              setEditing({ row: null });
            }}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
        <ul className="flex flex-col">
          {calendars.own.map((row) =>
            line(
              row,
              true,
              menu(
                row,
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditing({ row });
                    }}
                  >
                    {t("calendars.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setSharing(row);
                    }}
                  >
                    {t("calendars.share")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setImporting(row);
                    }}
                  >
                    {t("ics.importItem")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      downloadIcs(row);
                    }}
                  >
                    {t("ics.exportItem")}
                  </DropdownMenuItem>
                  {row.is_default === true ? null : (
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          void setDefaultCalendar(user, row, calendars.defaultId);
                        }}
                      >
                        {t("calendars.makeDefault")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          void updateCalendar(user, row, "archive", { archived_at: new Date().toISOString() });
                        }}
                      >
                        {t("calendars.archive")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        danger
                        onSelect={() => {
                          setDeleting(row);
                        }}
                      >
                        {t("calendars.delete")}
                      </DropdownMenuItem>
                    </>
                  )}
                </>,
              ),
            ),
          )}
        </ul>
      </section>

      {calendars.shared.length > 0 ? (
        <section aria-labelledby="calendars-shared" className="flex flex-col gap-1">
          <h2 id="calendars-shared" className={heading}>
            {t("calendars.shared")}
          </h2>
          <ul className="flex flex-col">
            {calendars.shared.map((row) => {
              const share = shareOf(row);
              return line(
                row,
                true,
                menu(
                  row,
                  <>
                    {calendars.canWrite(row.id) ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setImporting(row);
                        }}
                      >
                        {t("ics.importItem")}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => {
                        downloadIcs(row);
                      }}
                    >
                      {t("ics.exportItem")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      danger
                      disabled={!share}
                      onSelect={() => {
                        if (share) void shareActions.revoke(share, "grantee");
                      }}
                    >
                      {t("calendars.leave")}
                    </DropdownMenuItem>
                  </>,
                ),
                share ? t("calendars.sharedBy", { name: share.owner_name }) : undefined,
              );
            })}
          </ul>
        </section>
      ) : null}

      {calendars.archived.length > 0 ? (
        <details className="group">
          <summary className={`${heading} cursor-pointer py-1`}>
            {t("calendars.archived", { count: calendars.archived.length })}
          </summary>
          <ul className="flex flex-col">
            {calendars.archived.map((row) =>
              line(
                row,
                false,
                menu(
                  row,
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        void updateCalendar(user, row, "unarchive", { archived_at: null });
                      }}
                    >
                      {t("calendars.unarchive")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        downloadIcs(row);
                      }}
                    >
                      {t("ics.exportItem")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      danger
                      onSelect={() => {
                        setDeleting(row);
                      }}
                    >
                      {t("calendars.delete")}
                    </DropdownMenuItem>
                  </>,
                ),
              ),
            )}
          </ul>
        </details>
      ) : null}

      {editing ? (
        <CalendarDialog
          user={user}
          row={editing.row}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {importing ? (
        <IcsImportDialog
          user={user}
          calendar={importing}
          onClose={() => {
            setImporting(null);
          }}
        />
      ) : null}
      {sharing ? (
        <ShareDialog
          open
          onClose={() => {
            setSharing(null);
          }}
          containerKind="calendar"
          containerId={String(sharing.id)}
          containerName={name(sharing)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t("calendars.deleteTitle")}
        body={deleting ? t("calendars.deleteBody", { name: name(deleting), count: eventsIn(deleting) }) : ""}
        confirmLabel={t("calendars.deleteConfirm")}
        danger
        onConfirm={async () => {
          if (deleting && (await deleteCalendar(user, deleting))) setDeleting(null);
        }}
        onClose={() => {
          setDeleting(null);
        }}
      />
    </div>
  );
}

/** New calendar (row null) or the name and colour of an existing one. */
function CalendarDialog({ user, row, onClose }: { user: string; row: CalendarRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(row ? String(row.name) : "");
  const [color, setColor] = useState<Color>(row ? (row.color as Color) : "blue");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    let ok = true;
    if (!row) {
      ok = await createCalendar(user, trimmed, color);
    } else {
      const data = {
        ...(trimmed !== row.name ? { name: trimmed } : {}),
        ...(color !== row.color ? { color } : {}),
      };
      if (Object.keys(data).length > 0) ok = await updateCalendar(user, row, "edit", data);
    }
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t(row ? "calendars.editTitle" : "calendars.newTitle")} closeLabel={t("common.close")}>
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
          <Field id={`${id}-name`} label={t("calendars.name")}>
            {(aria) => (
              <Input
                {...aria}
                value={name}
                maxLength={NAME_MAX}
                required
                autoFocus
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <ColorPicker name={`${id}-color`} legend={t("calendars.color")} value={color} onChange={setColor} />
          <DialogFooter>
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || !trimmed}>
              {t(row ? "calendars.save" : "calendars.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
