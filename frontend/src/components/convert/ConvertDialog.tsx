// +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (D-125, stage 2). "Convert to…" from the event details, the
// note editor and the card editor: the kind it becomes (a note only for the owner's own item), the place — a calendar
// the user can add to and, without a due date, the day; a board the user can change and one of its columns (the card
// goes to the end); a note goes on top of the notes —, what stays and what changes or is taken off (lib/convert) and
// Convert, which asks the server (a connection is needed). A repeating event or someone else's note says why it cannot
// be converted. One notification with Undo; the caller then opens the item where it now is.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ConvertedItem } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import { useCalendars } from "@/components/calendar/useCalendars";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { boardLists } from "@/lib/boards";
import { newCardPosition } from "@/lib/cards";
import { columnsOf } from "@/lib/columns";
import { type ItemKind, changesOf, refusalOf, targetsOf } from "@/lib/convert";
import { todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { type ItemTarget } from "@/lib/links";
import { topPosition } from "@/lib/position";
import { newStep } from "@/lib/undo";
import { localKeys, localRows } from "@/sync";
import type { EntityType } from "@/sync/db";

import { type ConvertPlace, type ConvertStep, arrived, convertNow } from "./convertWrites";

type Row = Record<string, unknown>;

const NO_ROWS: Row[] = [];

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function useRows(user: string, entity: EntityType): Row[] {
  const { data = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table(entity), user],
    queryFn: () => localRows(user, entity),
    enabled: Boolean(user),
  });
  return data;
}

interface ConvertDialogProps {
  user: string;
  /** The item as the views read it (its details merged in). */
  row: Row;
  onClose: () => void;
  /** Converted (and its new row is on this device, or the wait ran out): where it opens now. */
  onDone: (target: ItemTarget) => void;
}

export function ConvertDialog({ user, row, onClose, onDone }: ConvertDialogProps) {
  const { t } = useTranslation();
  const timeZone = useDisplayTimeZone();
  const id = String(row.id);
  const from = row.kind as ItemKind;
  const targets = targetsOf(row, user);
  const refusal = refusalOf(row, user);
  const calendars = useCalendars(user);
  const items = useRows(user, "item");
  const boards = useRows(user, "board");
  const columnRows = useRows(user, "board_column");
  const shares = useRows(user, "share");
  const rows = {
    checklist: useRows(user, "checklist_item"),
    itemLabels: useRows(user, "item_label"),
    labels: useRows(user, "label"),
    assignees: useRows(user, "card_assignee"),
    comments: useRows(user, "comment"),
    reminders: useRows(user, "reminder"),
  };
  const editable = new Set(
    shares
      .filter(
        (share) =>
          share.container_kind === "board" &&
          share.grantee_id === user &&
          share.permission === "edit" &&
          !share.revoked_at,
      )
      .map((share) => share.container_id),
  );
  const lists = boardLists(boards, user);
  const writableBoards = [...lists.own, ...lists.shared.filter((board) => editable.has(board.id))];

  const [target, setTarget] = useState<ItemKind>(targets[0] ?? "card");
  const [calendarId, setCalendarId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [day, setDay] = useState(() => todayIn(timeZone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendar = calendarId || calendars.defaultId || text(calendars.writable[0]?.id);
  const board = boardId || text(writableBoards[0]?.id);
  const columns = board ? columnsOf(columnRows, board).active : [];
  const column = columns.some((c) => c.id === columnId) ? columnId : text(columns[0]?.id);
  const dated = text(row.due_date) !== "" || text(row.start_date) !== "";
  const title = text(row.title) || t("convert.untitled");
  const changes = changesOf(row, target, user, rows, board);

  const place = (): ConvertPlace | null => {
    if (target === "event") return calendar ? { calendar_id: calendar } : null;
    if (target === "card") {
      return board && column ? { board_id: board, column_id: column, position: newCardPosition(items, column) } : null;
    }
    const notes = items.filter((item) => item.kind === "note" && !item.deleted_at && item.id !== id);
    return { position: topPosition(notes.map((note) => text(note.position)).filter(Boolean)) };
  };
  const where = place();
  const missing =
    where === null
      ? t(
          target === "event"
            ? "convert.noCalendar"
            : writableBoards.length === 0
              ? "convert.noBoard"
              : "convert.noColumn",
        )
      : null;

  function targetOf(kind: ItemKind, at: ConvertPlace): ItemTarget {
    if (kind === "note") return { to: "/todo", search: { note: id } };
    if (kind === "card")
      return { to: "/kanban/$boardId", params: { boardId: at.board_id ?? "" }, search: { card: id } };
    return { to: "/calendar", search: { date: text(row.due_date) || day, view: "day", event: id } };
  }

  async function start() {
    if (!where || busy || refusal) return;
    setBusy(true);
    setError(null);
    const values = { title, kind: t(`convert.kindIs.${target}`) };
    const label = { key: "undo.labels.itemConverted", values };
    const body = { target_kind: target, version: typeof row.version === "number" ? row.version : undefined, ...where };
    const result = await runWrite<ConvertedItem>({
      name: "item_convert",
      run: () => convertNow(id, target === "event" && !dated ? { ...body, start_date: day || undefined } : body),
      failure: "inline",
      // A repeat after an answer that was lost meets the new version.
      retry: false,
      success: t("convert.done", values),
      reasons: (problem) =>
        problem.code === "invalid_state" || problem.code === "validation_failed" ? problem.detail : null,
      undo: (data) =>
        newStep<ConvertStep>("item.convert", label, {
          id,
          from,
          to: target,
          batch: data.batch_id,
          title: text(row.title),
          body: typeof row.body === "string" ? row.body : null,
          place: where,
        }),
    });
    if (result.ok) {
      await arrived(user, id, target);
      onDone(targetOf(target, where));
      return;
    }
    setBusy(false);
    setError(result.reason);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent title={t("convert.title", { title })} closeLabel={t("common.close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          {refusal ? (
            <p className="text-[13px] text-muted">{t(`convert.refused.${refusal}`)}</p>
          ) : (
            <>
              <Field id="convert-kind" label={t("convert.to")}>
                {(aria) => (
                  <Select
                    {...aria}
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value as ItemKind);
                    }}
                  >
                    {targets.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`convert.kind.${kind}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {target === "event" ? (
                <>
                  <Field id="convert-calendar" label={t("convert.calendar")}>
                    {(aria) => (
                      <Select
                        {...aria}
                        value={calendar}
                        onChange={(e) => {
                          setCalendarId(e.target.value);
                        }}
                      >
                        {calendars.writable.map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {text(c.name)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {dated ? (
                    <p className="text-[13px] text-muted">{t("convert.onDueDate")}</p>
                  ) : (
                    <Field id="convert-day" label={t("convert.day")} hint={t("convert.dayHint")}>
                      {(aria) => (
                        <Input
                          {...aria}
                          type="date"
                          required
                          value={day}
                          onChange={(e) => {
                            setDay(e.target.value);
                          }}
                        />
                      )}
                    </Field>
                  )}
                </>
              ) : null}
              {target === "card" ? (
                <>
                  <Field id="convert-board" label={t("convert.board")}>
                    {(aria) => (
                      <Select
                        {...aria}
                        value={board}
                        onChange={(e) => {
                          setBoardId(e.target.value);
                          setColumnId("");
                        }}
                      >
                        {writableBoards.map((b) => (
                          <option key={String(b.id)} value={String(b.id)}>
                            {text(b.name)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field id="convert-column" label={t("convert.column")}>
                    {(aria) => (
                      <Select
                        {...aria}
                        value={column}
                        onChange={(e) => {
                          setColumnId(e.target.value);
                        }}
                      >
                        {columns.map((c) => (
                          <option key={String(c.id)} value={String(c.id)}>
                            {text(c.name)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </>
              ) : null}
              {target === "note" ? <p className="text-[13px] text-muted">{t("convert.toNotes")}</p> : null}
              {missing ? <p className="text-[13px] text-danger">{missing}</p> : null}
              <section aria-label={t("convert.changesTitle")} className="flex flex-col gap-1 text-[13px]">
                <p>{t("convert.kept")}</p>
                {changes.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted">
                    {changes.map((change) => (
                      <li key={change.key}>{t(`convert.changes.${change.key}`, change.values)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </>
          )}
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={onClose} disabled={busy}>
              {t(refusal ? "common.close" : "common.cancel")}
            </Button>
            {refusal ? null : (
              <Button type="submit" variant="primary" disabled={busy || where === null}>
                {t("convert.submit")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
