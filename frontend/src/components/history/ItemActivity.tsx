// +++===+++ 2026-11-25 09:30 +04 — Hasan Alizada — HAAL-114 (FR-KAN-05, FR-X-03, D-123). The activity of an item, newest
// first: its history from the audit log (GET /items/{id}/history, pages of 50, "Show more") in words (lib/activity),
// and on a card its comments. The comments come from this device (offline too, at once); the history needs the
// server: offline, or before the item has reached it, a line says so and the comments still show.
// - A card (`comments`): a Markdown box on top, "Comment" or Ctrl/Cmd+Enter sends (the card's own Save keys stay
//   with the card); "Comments only" hides the history. Its author changes a comment ("edited" marks it afterwards);
//   its author or the board's owner deletes it, with Undo. A view share or an archived board only reads.
// - An event or a note (`collapsed`): a closed "History" block, asked from the server only once opened.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { BoardMember } from "@/api/boards";
import { getItemHistory } from "@/api/generated/sdk.gen";
import type { AuditRecord } from "@/api/generated/types.gen";
import { meQuery } from "@/api/session";
import { ApiError } from "@/api/problem";
import {
  COMMENT_MAX,
  commentRights,
  commentsOf,
  createComment,
  deleteComment,
  sendable,
  updateComment,
} from "@/components/kanban/commentWrites";
import { Markdown } from "@/components/markdown/Markdown";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { useConnectionState } from "@/components/shell/useConnectionState";
import { Button } from "@/components/ui/button";
import { type ActivityLine, type ActivityNames, activityLine, type ItemKind } from "@/lib/activity";
import { useInstantFormat } from "@/lib/datetime";
import { useNow } from "@/lib/useNow";
import { localKeys, localRows } from "@/sync";
import type { EntityType } from "@/sync/db";

type Row = Record<string, unknown>;

const HISTORY_PAGE = 50;
const NO_ROWS: Row[] = [];
const text = (value: unknown) => (typeof value === "string" ? value : "");

const historyKeys = {
  all: ["session", "itemHistory"] as const,
  item: (id: string) => ["session", "itemHistory", id] as const,
};

function useLocal(user: string, entity: EntityType): Row[] {
  const { data = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table(entity), user],
    queryFn: () => localRows(user, entity),
    enabled: Boolean(user),
  });
  return data;
}

function byId(rows: readonly Row[], name: string): Map<string, string> {
  return new Map(rows.map((row) => [String(row.id), text(row[name])]));
}

interface CommentsProps {
  /** The card's board: its owner deletes any comment. */
  boardOwner: unknown;
  /** The user writes the board (owner or edit share, not archived). */
  canWrite: boolean;
  members: readonly BoardMember[];
}

interface ItemActivityProps {
  user: string;
  item: Row;
  /** A card: with its comments. */
  comments?: CommentsProps;
  /** An event or a note: a closed "History" block. */
  collapsed?: boolean;
}

type Entry =
  | { type: "comment"; id: string; at: string; row: Row }
  | { type: "record"; id: string; at: string; record: AuditRecord; line: ActivityLine };

export function ItemActivity({ user, item, comments, collapsed = false }: ItemActivityProps) {
  const { t, i18n } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const format = useInstantFormat();
  const now = useNow();
  const connection = useConnectionState();
  const [open, setOpen] = useState(!collapsed);
  const [commentsOnly, setCommentsOnly] = useState(false);
  const id = String(item.id);
  const kind = (text(item.kind) || "card") as ItemKind;
  const onServer = typeof item.version === "number" && item.version > 0;
  const reachable = connection === "online" || connection === "checking";

  const commentRows = useLocal(user, "comment");
  const live = useMemo(() => (comments ? commentsOf(commentRows, id) : NO_ROWS), [comments, commentRows, id]);
  const history = useInfiniteQuery({
    // The card's version and its comments: a change refreshes the history.
    queryKey: [...historyKeys.item(id), item.version, live.length],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await getItemHistory({
        path: { id },
        query: { limit: HISTORY_PAGE, ...(pageParam ? { cursor: pageParam } : {}) },
      });
      if (error !== undefined) throw new ApiError(error);
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? null,
    enabled: open && onServer && reachable && !commentsOnly,
    retry: false,
  });

  const columns = useLocal(user, "board_column");
  const labels = useLocal(user, "label");
  const items = useLocal(user, "item");
  const childTables = [
    useLocal(user, "checklist_item"),
    useLocal(user, "item_label"),
    useLocal(user, "card_assignee"),
    useLocal(user, "link"),
    useLocal(user, "attachment"),
  ];
  const records = useMemo(() => history.data?.pages.flatMap((page) => page.data) ?? [], [history.data]);
  const users = useMemo(() => {
    const names = new Map<string, string>();
    for (const record of records)
      if (record.actor_id && record.actor_name) names.set(record.actor_id, record.actor_name);
    for (const member of comments?.members ?? []) names.set(member.user_id, member.display_name);
    return names;
  }, [records, comments?.members]);
  const names: ActivityNames = {
    columns: byId(columns, "name"),
    labels: byId(labels, "name"),
    users,
    items: new Map(items.map((row) => [String(row.id), text(row.title) || t("notifications.unnamed")])),
    rows: new Map(childTables.flat().map((row) => [String(row.id), row])),
  };

  const entries: Entry[] = [
    ...live.map((row): Entry => ({ type: "comment", id: String(row.id), at: text(row.created_at), row })),
    ...(commentsOnly
      ? []
      : records.flatMap((record): Entry[] => {
          const line = activityLine(record, { id, kind }, names);
          return line ? [{ type: "record", id: record.id, at: record.occurred_at, record, line }] : [];
        })),
  ].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

  const person = (userId: unknown, fallback?: string | null) =>
    userId && userId === me?.id ? t("activity.you") : (users.get(String(userId)) ?? fallback ?? t("activity.someone"));
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const sentence = (line: ActivityLine) =>
    line.fields
      ? t("activity.changed", {
          fields: list.format(
            [...new Set(line.fields)].map((name) => t(`activity.fields.${name}` as "activity.fields.other")),
          ),
        })
      : // Every value a line may name, so the typed key of any line takes them.
        t(`activity.${line.key}` as "activity.linked", { title: "", ...line.values });

  const historyNote = commentsOnly
    ? null
    : !onServer
      ? t("activity.notOnServer")
      : !reachable
        ? t("activity.offline")
        : history.isError
          ? t("activity.loadFailed")
          : null;

  const body = (
    <div className="flex flex-col gap-3">
      {comments?.canWrite ? <CommentBox user={user} card={item} /> : null}
      {comments ? (
        <label className="flex items-center gap-2 self-start text-[13px]">
          <input
            type="checkbox"
            checked={commentsOnly}
            onChange={(e) => {
              setCommentsOnly(e.target.checked);
            }}
          />
          {t("activity.commentsOnly")}
        </label>
      ) : null}
      {historyNote ? <p className="text-xs text-muted">{historyNote}</p> : null}
      {entries.length === 0 && !history.isFetching && !historyNote ? (
        <p className="text-[13px] text-muted">{t(commentsOnly ? "comments.none" : "activity.empty")}</p>
      ) : null}
      <ol className="flex flex-col gap-3" aria-label={t(comments ? "activity.title" : "activity.history")}>
        {entries.map((entry) => {
          const at = (
            <time dateTime={entry.at} title={entry.at ? format.instant(entry.at) : undefined}>
              {entry.at ? format.relative(entry.at, new Date(now)) : ""}
            </time>
          );
          if (entry.type === "comment")
            return (
              <CommentEntry
                key={entry.id}
                user={user}
                row={entry.row}
                author={person(entry.row.author_id)}
                at={at}
                rights={commentRights(entry.row, user, comments?.boardOwner, Boolean(comments?.canWrite))}
              />
            );
          return (
            <li key={entry.id} className="border-l-2 border-line pl-3 text-[13px]">
              <span className="font-medium">{person(entry.record.actor_id, entry.record.actor_name)}</span>{" "}
              {sentence(entry.line)}
              <span className="text-muted">
                {" · "}
                {at}
              </span>
            </li>
          );
        })}
      </ol>
      {history.hasNextPage && !commentsOnly ? (
        <Button
          className="self-start"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {t("activity.more")}
        </Button>
      ) : null}
    </div>
  );

  if (collapsed)
    return (
      <details
        className="flex flex-col gap-2"
        onToggle={(e) => {
          setOpen(e.currentTarget.open);
        }}
      >
        <summary className="cursor-pointer text-[13px] font-medium">{t("activity.history")}</summary>
        {open ? <div className="pt-2">{body}</div> : null}
      </details>
    );
  return (
    <section aria-labelledby={`activity-${id}`} className="flex flex-col gap-2">
      <h3 id={`activity-${id}`} className="text-[13px] font-medium">
        {t("activity.title")}
      </h3>
      {body}
    </section>
  );
}

/** Ctrl/Cmd+Enter in a comment's text: sends it, and the editor around does not save. */
function sendKey(event: KeyboardEvent, send: () => void): void {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === "Enter") {
    event.preventDefault();
    send();
  }
}

function CommentBox({ user, card }: { user: string; card: Row }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const id = String(card.id);
  const tooLong = body.length > COMMENT_MAX;

  async function send() {
    if (busy || !sendable(body)) return;
    setBusy(true);
    const ok = await createComment(user, id, text(card.title).trim() || t("notifications.unnamed"), body);
    setBusy(false);
    if (ok) setBody("");
  }

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(e) => {
        sendKey(e, () => void send());
      }}
    >
      <MarkdownEditor
        id={`comment-new-${id}`}
        label={t("comments.label")}
        value={body}
        onChange={setBody}
        rows={3}
        placeholder={t("comments.placeholder")}
        error={tooLong ? t("comments.tooLong", { max: COMMENT_MAX }) : undefined}
      />
      <Button className="self-start" disabled={busy || !sendable(body)} onClick={() => void send()}>
        <MessageSquare aria-hidden />
        {t("comments.send")}
      </Button>
    </div>
  );
}

interface CommentEntryProps {
  user: string;
  row: Row;
  author: string;
  at: React.ReactNode;
  rights: { edit: boolean; remove: boolean };
}

function CommentEntry({ user, row, author, at, rights }: CommentEntryProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = String(row.id);

  async function save() {
    if (editing === null || busy || !sendable(editing)) return;
    setBusy(true);
    const ok = await updateComment(user, row, editing);
    setBusy(false);
    if (ok) setEditing(null);
  }

  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-line p-2"
      aria-label={t("comments.by", { name: author })}
    >
      <span className="flex flex-wrap items-center gap-x-1 text-[13px]">
        <MessageSquare className="size-3.5 text-muted" aria-hidden />
        <span className="font-medium">{author}</span>
        <span className="text-muted">
          {" · "}
          {at}
          {row.edited_at ? ` · ${t("comments.edited")}` : ""}
        </span>
        <span className="ml-auto flex gap-1">
          {rights.edit && editing === null ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("comments.edit")}
              onClick={() => {
                setEditing(text(row.body));
              }}
            >
              <Pencil aria-hidden />
            </Button>
          ) : null}
          {rights.remove ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t("comments.delete")}
              onClick={() => void deleteComment(user, row)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </span>
      </span>
      {editing === null ? (
        <Markdown source={text(row.body)} className="text-[13px]" />
      ) : (
        <div
          className="flex flex-col gap-2"
          onKeyDown={(e) => {
            sendKey(e, () => void save());
          }}
        >
          <MarkdownEditor
            id={`comment-${id}`}
            label={t("comments.editLabel")}
            value={editing}
            onChange={setEditing}
            rows={3}
            error={editing.length > COMMENT_MAX ? t("comments.tooLong", { max: COMMENT_MAX }) : undefined}
          />
          <span className="flex gap-2">
            <Button
              onClick={() => {
                setEditing(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button variant="primary" disabled={busy || !sendable(editing)} onClick={() => void save()}>
              {t("comments.save")}
            </Button>
          </span>
        </div>
      )}
    </li>
  );
}
