// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. One board at /kanban/<id> (FR-KAN-01, D-90): a way back to all boards,
// the name and a menu — for the owner Rename…, Share… (the share dialog), Archive / Unarchive and Delete… (a
// confirmation naming its cards; to the trash with Undo, then back to all boards); for a grantee the owner's name and
// Leave. An archived board says it is read-only and offers Unarchive to its owner. Columns and cards follow with
// HAAL-111/112; until then the board invites them. A board that is not (or no longer) there says so.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The board shows its columns (D-91); the board menu lists the archived
// columns. Columns are written by the owner and edit shares while the board is not archived.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards in the columns; a card opens the card editor (D-92).
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, Columns3, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
import { columnsOf } from "@/lib/columns";
import { useAttachmentCounts } from "@/lib/eventRow";
import { localKeys, localRows } from "@/sync";

import { ArchivedColumnsDialog } from "./ArchivedColumnsDialog";
import { BoardColumns } from "./BoardColumns";
import { CardEditor } from "./CardEditor";
import { deleteBoard, updateBoard } from "./boardWrites";
import { NameDialog } from "./NameDialog";
import { useBoards } from "./useBoards";

type Dialog = "rename" | "share" | "delete" | "archivedColumns" | null;

function useLocal(user: string, entity: "item" | "board_column" | "share" | "label" | "item_label" | "checklist_item") {
  return useQuery({
    queryKey: [...localKeys.table(entity), user],
    queryFn: () => (user ? localRows(user, entity) : Promise.resolve([])),
    enabled: Boolean(user),
  }).data;
}

export function BoardPage({ boardId }: { boardId: string }) {
  const { t } = useTranslation();
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
  const attachments = useAttachmentCounts(user);
  const boardLabels = labelRows.filter((label) => label.board_id === boardId && !label.deleted_at);
  const [editing, setEditing] = useState<string | null>(null);
  const editingCard = editing ? items.find((item) => item.id === editing && !item.deleted_at) : undefined;
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
          onOpenCard={(card) => {
            setEditing(String(card.id));
          }}
        />
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
          card={editingCard}
          columns={columns.active}
          items={items}
          canWrite={canWrite}
          onClose={() => {
            setEditing(null);
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
