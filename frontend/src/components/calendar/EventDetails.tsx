// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. Event details card (FR-CAL-08, F-15, D-65): title, "Repeats" and
// "All day" badges, the range of THIS occurrence in the viewer's zone, location, calendar, priority, the description
// (first 50 characters, "more" shows it in full as Markdown), attachments (from the local database, so the list is
// there offline; thumbnails load from the server), created / updated times and the actions. Today: Edit (also the key
// E) when the calendar is writable, otherwise "View only"; delete, occurrences, colour, next day and duplicate join
// with their tasks (HAAL-065/067/081/084/096). Rendered in a popover next to the row, or in a sheet on phones.
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-065. Delete (button and the Delete key) next to Edit; the page asks first.
// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-081. The colour picker, saving at once (EventColor).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. "Move to next day" between Edit and Delete (FR-CAL-20).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. The user's own reminders of the event, under the calendar line.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. "Duplicate…" (button and the key D) after "Move to next day".
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarArrowUp,
  CalendarDays,
  Copy,
  Eye,
  MapPin,
  Paperclip,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Attachment, Priority } from "@/api/generated/types.gen";
import { useSettings } from "@/api/settings";
import { AttachmentPreview } from "@/components/attachments/Attachments";
import { Markdown } from "@/components/markdown/Markdown";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/ui/priority";
import { RecordTimestamps } from "@/components/ui/record-timestamps";
import { useDisplayTimeZone } from "@/lib/datetime";
import { eventRange } from "@/lib/dayView";
import { describeRrule } from "@/lib/repeatRule";
import { toPlainText } from "@/lib/markdown-text";
import { ItemLinks } from "@/components/links/ItemLinks";
import { reminderLabel, remindersOf } from "@/lib/reminders";
import { useShortcut } from "@/lib/shortcuts";
import { localKeys, localRows } from "@/sync";

import { EventColor } from "./EventColor";

type Row = Record<string, unknown>;

export const PREVIEW_CHARS = 50;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

interface EventDetailsProps {
  user: string;
  row: Row;
  /** The occurrence shown (its date). */
  occurrence: string;
  calendarName: string | null;
  writable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveNextDay: () => void;
  onDuplicate: () => void;
}

function useAttachments(user: string, itemId: string): Attachment[] {
  const { data = [] } = useQuery({
    queryKey: [...localKeys.table("attachment"), user],
    queryFn: () => localRows(user, "attachment"),
    enabled: Boolean(user),
  });
  return data
    .filter((a) => a.item_id === itemId && !a.deleted_at)
    .map(
      (a) =>
        ({
          ...a,
          url: `/api/v1/attachments/${text(a.id)}`,
          thumbnail_url: `/api/v1/attachments/${text(a.id)}/thumbnail`,
        }) as unknown as Attachment,
    );
}

export function EventDetails({
  user,
  row,
  occurrence,
  calendarName,
  writable,
  onEdit,
  onDelete,
  onMoveNextDay,
  onDuplicate,
}: EventDetailsProps) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const viewerTz = useDisplayTimeZone();
  const [full, setFull] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const id = text(row.id);
  const attachments = useAttachments(user, id);
  const { data: reminderRows = [] } = useQuery({
    queryKey: [...localKeys.table("reminder"), user],
    queryFn: () => localRows(user, "reminder"),
    enabled: Boolean(user),
  });
  const reminders = remindersOf(reminderRows, id);
  const body = text(row.body);
  const plain = toPlainText(body, { singleLine: true });
  // +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. The whole rule as text ("Every 2 weeks on Mon and Thu, 10 times").
  const repeat = row.rrule
    ? (describeRrule(row.rrule, text(row.start_date), i18n.language) ?? t("calendar.day.repeats"))
    : null;

  useShortcut({
    id: "calendar:details-edit",
    keys: ["E"],
    group: "items",
    label: "calendar.details.edit",
    allowInDialog: true,
    enabled: writable,
    handler: onEdit,
  });
  useShortcut({
    id: "calendar:details-delete",
    keys: ["Delete"],
    group: "items",
    label: "calendar.details.delete",
    allowInDialog: true,
    enabled: writable,
    handler: onDelete,
  });
  useShortcut({
    id: "calendar:details-duplicate",
    keys: ["D"],
    group: "items",
    label: "calendar.copy.key",
    allowInDialog: true,
    enabled: writable,
    handler: onDuplicate,
  });

  return (
    <div className="flex max-w-full flex-col gap-3 text-[13px] wrap-anywhere">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[15px] font-semibold">{text(row.title) || t("calendar.day.noTitle")}</h3>
        <div className="flex flex-wrap gap-1.5">
          {repeat ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-xs">
              <Repeat className="size-3" aria-hidden />
              {t("calendar.details.repeats", { rule: repeat })}
            </span>
          ) : null}
          {row.all_day !== false ? (
            <span className="rounded-sm bg-surface px-1.5 py-0.5 text-xs">{t("calendar.day.allDay")}</span>
          ) : null}
          <PriorityBadge priority={text(row.priority) as Priority} hideDefault />
          {!writable ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-xs text-muted">
              <Eye className="size-3" aria-hidden />
              {t("calendar.details.viewOnly")}
            </span>
          ) : null}
        </div>
      </div>

      <p className="tabular-nums">{eventRange(row, occurrence, viewerTz, i18n.language, timeFormat)}</p>
      {text(row.location) ? (
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-label={t("calendar.editor.location")} />
          {text(row.location)}
        </p>
      ) : null}
      {calendarName ? (
        <p className="flex items-center gap-1.5 text-muted">
          <CalendarDays className="size-3.5 shrink-0" aria-label={t("calendar.editor.calendar")} />
          {calendarName}
        </p>
      ) : null}
      {reminders.length > 0 ? (
        <p className="flex items-start gap-1.5">
          <Bell className="mt-0.5 size-3.5 shrink-0 text-muted" aria-label={t("reminders.title")} />
          {reminders.map((reminder) => reminderLabel(reminder.spec, timeFormat)).join(", ")}
        </p>
      ) : null}
      <EventColor user={user} row={row} writable={writable} />
      {/* +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. The event's links (D-98). */}
      <ItemLinks user={user} item={row} canWrite={writable} />

      {body ? (
        <div className="flex flex-col gap-1">
          {full ? (
            <Markdown source={body} />
          ) : (
            <p className="text-muted">
              {plain.length > PREVIEW_CHARS ? `${plain.slice(0, PREVIEW_CHARS).trimEnd()}…` : plain}
            </p>
          )}
          {plain.length > PREVIEW_CHARS || body !== plain ? (
            <button
              type="button"
              className="w-fit text-primary underline underline-offset-2"
              aria-expanded={full}
              onClick={() => {
                setFull(!full);
              }}
            >
              {full ? t("calendar.details.less") : t("calendar.details.more")}
            </button>
          ) : null}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <section aria-label={t("attachments.title")} className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-xs text-muted">
            <Paperclip className="size-3" aria-hidden />
            {t("calendar.details.attachments", { count: attachments.length })}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment, index) => (
              <button
                key={attachment.id}
                type="button"
                title={attachment.file_name}
                aria-label={t("calendar.details.openAttachment", { name: attachment.file_name })}
                className="size-14 overflow-hidden rounded-sm border border-line bg-surface"
                onClick={() => {
                  setPreview(index);
                }}
              >
                <img src={attachment.thumbnail_url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
          <AttachmentPreview attachments={attachments} index={preview} onIndex={setPreview} />
        </section>
      ) : null}

      {typeof row.created_at === "string" && typeof row.updated_at === "string" ? (
        <RecordTimestamps
          record={{ created_at: row.created_at, updated_at: row.updated_at }}
          className="text-xs text-muted"
        />
      ) : null}

      {writable ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="primary" onClick={onEdit}>
            <Pencil aria-hidden />
            {t("calendar.details.edit")}
          </Button>
          <Button onClick={onMoveNextDay}>
            <CalendarArrowUp aria-hidden />
            {t("calendar.details.moveNextDay")}
          </Button>
          <Button onClick={onDuplicate}>
            <Copy aria-hidden />
            {t("calendar.details.duplicate")}
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 aria-hidden />
            {t("calendar.details.delete")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
