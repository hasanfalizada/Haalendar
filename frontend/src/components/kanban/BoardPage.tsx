// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. One board at /kanban/<id> (FR-KAN-01, D-90): a way back to all boards,
// the name and a menu — for the owner Rename…, Share… (the share dialog), Archive / Unarchive and Delete… (a
// confirmation naming its cards; to the trash with Undo, then back to all boards); for a grantee the owner's name and
// Leave. An archived board says it is read-only and offers Unarchive to its owner. Columns and cards follow with
// HAAL-111/112; until then the board invites them. A board that is not (or no longer) there says so.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The board shows its columns (D-91); the board menu lists the archived
// columns. Columns are written by the owner and edit shares while the board is not archived.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards in the columns; a card opens the card editor (D-92).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. `focusCard` (from a reminder, `?card=`) opens that card's editor once
// it has arrived; closing it drops the parameter. The user's reminders give the cards their bell (D-94).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. The board filters (BoardFilters, D-96) under the header, kept in the
// address; the columns show the cards that pass them.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. The board's members (for assignees, D-97): the cards show their
// assignees, the editor assigns them, the filters take them.
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, Columns3, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { boardMembersQuery } from "@/api/boards";
import { useSettings } from "@/api/settings";
import { sharesQuery } from "@/api/sharing";
import { ShareDialog } from "@/components/sharing/ShareDialog";
import { useShareActions } from "@/components/sharing/useShareActions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STANDALONE_LINK } from "@/components/ui/link-styles";
import { type BoardFilter, cardMatches, filterCount, formatBoardFilter } from "@/lib/boardFilter";
import { columnsOf } from "@/lib/columns";
import { useDisplayTimeZone } from "@/lib/datetime";
import { useAttachmentCounts } from "@/lib/eventRow";
import { useNow } from "@/lib/useNow";
import { localKeys, localRows } from "@/sync";

import { ArchivedColumnsDialog } from "./ArchivedColumnsDialog";
import { BoardColumns } from "./BoardColumns";
import { BoardFilters } from "./BoardFilters";
import { CardEditor } from "./CardEditor";
import { deleteBoard, updateBoard } from "./boardWrites";
import { NameDialog } from "./NameDialog";
import { useBoards } from "./useBoards";

type Dialog = "rename" | "share" | "delete" | "archivedColumns" | null;

function useLocal(
  user: string,
  entity: "item" | "board_column" | "share" | "label" | "item_label" | "checklist_item" | "reminder" | "card_assignee",
) {
  return useQuery({
    queryKey: [...localKeys.table(entity), user],
    queryFn: () => (user ? localRows(user, entity) : Promise.resolve([])),
    enabled: Boolean(user),
  }).data;
}

interface BoardPageProps {
  boardId: string;
  filter: BoardFilter;
  focusCard?: string;
}

export function BoardPage({ boardId, filter, focusCard }: BoardPageProps) {
  const { t } = useTranslation();
  const timeZone = useDisplayTimeZone();
  const now = useNow();
  const { week_start: weekStart } = useSettings();
  const navigate = useNavigate();
  const boards = useBoards();
  const { user } = boards;
  const row = boards.rows.find((board) => board.id === boardId && !board.deleted_at);
  const owner = row?.owner_id === user;
  const archived = Boolean(row?.archived_at);
  const [dialog, setDialog] = useState<Dialog>(null);
  const shareActions = useShareActions();
  const received = useQuery({
    ...sharesQuery({ direction: "received", containerKind: "board" }),
    enabled: Boolean(row) && !owner,
  });
  const share = received.data?.find((s) => s.container_id === boardId);
  const items = useLocal(user, "item") ?? [];
  const columnRows = useLocal(user, "board_column") ?? [];
  const shareRows = useLocal(user, "share") ?? [];
  const labelRows = useLocal(user, "label") ?? [];
  const itemLabelRows = useLocal(user, "item_label") ?? [];
  const checklistRows = useLocal(user, "checklist_item") ?? [];
  const reminderRows = useLocal(user, "reminder") ?? [];
  const assigneeRows = useLocal(user, "card_assignee") ?? [];
  const members = useQuery({ ...boardMembersQuery(boardId), enabled: Boolean(row) }).data ?? [];
  const memberIds = new Set(members.map((member) => member.user_id));
  // The names of each card's assignees (members only, in the members' order).
  const assigneeNames = new Map<string, string[]>();
  for (const member of members) {
    for (const assignee of assigneeRows) {
      if (assignee.user_id !== member.user_id || assignee.deleted_at) continue;
      const cardId = String(assignee.item_id);
      assigneeNames.set(cardId, [...(assigneeNames.get(cardId) ?? []), member.display_name]);
    }
  }
  const attachments = useAttachmentCounts(user);
  const boardLabels = labelRows
    .filter((label) => label.board_id === boardId && !label.deleted_at)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const [editing, setEditing] = useState<string | null>(null);
  const editingCard = editing ? items.find((item) => item.id === editing && !item.deleted_at) : undefined;
  // The card a reminder leads to opens once it has arrived (adjusted while rendering, not in an effect).
  const [focused, setFocused] = useState<string | null>(null);
  if (focusCard && focusCard !== focused) {
    const target = items.find(
      (item) => item.id === focusCard && item.container_id === boardId && item.kind === "card" && !item.deleted_at,
    );
    if (target) {
      setFocused(focusCard);
      setEditing(focusCard);
    }
  }
  const columns = columnsOf(columnRows, boardId);
  const editShare = shareRows.some(
    (s) =>
      s.container_kind === "board" &&
      s.container_id === boardId &&
      s.grantee_id === user &&
      s.permission === "edit" &&
      !s.revoked_at,
  );
  const canWrite = !archived && (owner || editShare);
  const cards = items.filter(
    (item) => item.container_kind === "board" && item.container_id === boardId && !item.deleted_at,
  ).length;
  const toAll = () => void navigate({ to: "/kanban" });
  const filtering = filterCount(filter) > 0;
  const shown = (card: Record<string, unknown>) =>
    cardMatches(card, filter, {
      itemLabels: itemLabelRows,
      checklistItems: checklistRows,
      assignees: assigneeRows,
      members: memberIds,
      me: user,
      timeZone,
      now,
      weekStart,
    });
  // Typing in the search replaces the address entry instead of adding one per letter.
  const setFilter = (next: BoardFilter) => {
    void navigate({
      to: "/kanban/$boardId",
      params: { boardId },
      search: (previous) => ({ ...previous, ...formatBoardFilter(next) }),
      replace: next.text !== filter.text,
    });
  };

  const back = (
    <Link to="/kanban" className={`${STANDALONE_LINK} gap-1 text-[13px]`}>
      <ArrowLeft className="size-4" aria-hidden />
      {t("kanban.all")}
    </Link>
  );

  if (!row) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-line px-2 py-1.5 md:px-4">{back}</div>
        {boards.loaded ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <h1 className="text-[15px] font-semibold">{t("kanban.missingTitle")}</h1>
              <p className="text-muted">{t("kanban.missingBody")}</p>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  const name = String(row.name);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2 py-1.5 md:px-4">
        {back}
        <h1 className="min-w-0 truncate text-lg font-semibold">{name}</h1>
        {!owner && share ? (
          <span className="text-xs text-muted">{t("kanban.sharedBy", { name: share.owner_name })}</span>
        ) : null}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("kanban.menu", { name })}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columns.archived.length > 0 ? (
                <DropdownMenuItem
                  onSelect={() => {
                    setDialog("archivedColumns");
                  }}
                >
                  {t("kanban.columns.archivedItem", { count: columns.archived.length })}
                </DropdownMenuItem>
              ) : null}
              {owner ? (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      setDialog("rename");
                    }}
                  >
                    {t("kanban.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setDialog("share");
                    }}
                  >
                    {t("kanban.share")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void updateBoard(
                        user,
                        row,
                        archived ? "unarchive" : "archive",
                        archived ? { archived_at: null } : { archived_at: new Date().toISOString() },
                      );
                    }}
                  >
                    {t(archived ? "kanban.unarchive" : "kanban.archive")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    danger
                    onSelect={() => {
                      setDialog("delete");
                    }}
                  >
                    {t("kanban.delete")}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  danger
                  disabled={!share}
                  onSelect={() => {
                    if (!share) return;
                    void shareActions.revoke(share, "grantee").then((result) => {
                      if (result.ok) toAll();
                    });
                  }}
                >
                  {t("kanban.leave")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {archived ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-3 py-2 text-[13px] md:px-4"
        >
          <Archive className="size-4 text-muted" aria-hidden />
          <span>{t("kanban.archivedNotice")}</span>
          {owner ? (
            <Button
              onClick={() => {
                void updateBoard(user, row, "unarchive", { archived_at: null });
              }}
            >
              {t("kanban.unarchive")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {columns.active.length === 0 && !canWrite ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-2">
            <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
              <Columns3 className="size-6" aria-hidden />
            </div>
            <h2 className="text-[15px] font-semibold">{t("kanban.noColumnsTitle")}</h2>
            <p className="text-muted">{t("kanban.noColumnsBody")}</p>
          </div>
        </div>
      ) : (
        <>
          <BoardFilters filter={filter} labels={boardLabels} members={members} me={user} onChange={setFilter} />
          <BoardColumns
            user={user}
            boardId={boardId}
            active={columns.active}
            allColumns={columnRows}
            items={items}
            canWrite={canWrite}
            labels={boardLabels}
            itemLabels={itemLabelRows}
            checklistItems={checklistRows}
            attachments={attachments}
            reminders={reminderRows}
            timeZone={timeZone}
            shown={filtering ? shown : undefined}
            assignees={assigneeNames}
            onOpenCard={(card) => {
              setEditing(String(card.id));
            }}
          />
        </>
      )}

      {dialog === "rename" ? (
        <NameDialog
          title={t("kanban.renameTitle")}
          submitLabel={t("kanban.save")}
          maxLength={100}
          initial={name}
          onSave={(next) => updateBoard(user, row, "rename", { name: next })}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {editingCard ? (
        <CardEditor
          key={String(editingCard.id)}
          user={user}
          boardId={boardId}
          card={editingCard}
          labels={boardLabels}
          itemLabels={itemLabelRows}
          members={members}
          assigneeRows={assigneeRows}
          columns={columns.active}
          items={items}
          canWrite={canWrite}
          onClose={() => {
            setEditing(null);
            if (focusCard) {
              void navigate({
                to: "/kanban/$boardId",
                params: { boardId },
                search: (previous) => ({ ...previous, card: undefined }),
              });
            }
          }}
        />
      ) : null}
      {dialog === "archivedColumns" ? (
        <ArchivedColumnsDialog
          user={user}
          columns={columns.archived}
          canWrite={canWrite}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "share" ? (
        <ShareDialog
          open
          onClose={() => {
            setDialog(null);
          }}
          containerKind="board"
          containerId={boardId}
          containerName={name}
        />
      ) : null}
      <ConfirmDialog
        open={dialog === "delete"}
        title={t("kanban.deleteTitle")}
        body={t("kanban.deleteBody", { name, count: cards })}
        confirmLabel={t("kanban.deleteConfirm")}
        danger
        onConfirm={async () => {
          if (await deleteBoard(user, row)) {
            setDialog(null);
            toAll();
          }
        }}
        onClose={() => {
          setDialog(null);
        }}
      />
    </div>
  );
}
