// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. The Kanban start page (FR-KAN-01, D-90): the user's boards as tiles —
// "My boards", "Shared with me" (the owner named when the shares could be read) and "Archived" (folded) —, each opening
// its board at /kanban/<id>; New board (in the header from tablets, a floating button on phones) asks for a name, writes
// the board through sync (offline too, with Undo) and opens it. Without boards the page invites the first one.
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Columns3, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { sharesQuery } from "@/api/sharing";
import { Button } from "@/components/ui/button";
import { newBoardPosition } from "@/lib/boards";
import { TABLET_UP, useMediaQuery } from "@/lib/useMediaQuery";
import { localRows } from "@/sync";

import { BoardNameDialog } from "./BoardNameDialog";
import { createBoard } from "./boardWrites";
import { useBoards } from "./useBoards";

type Row = Record<string, unknown>;

const HEADING = "text-xs font-semibold tracking-wide text-muted uppercase";

export function BoardsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tablet = useMediaQuery(TABLET_UP);
  const boards = useBoards();
  const [creating, setCreating] = useState(false);
  const received = useQuery({
    ...sharesQuery({ direction: "received", containerKind: "board" }),
    enabled: boards.shared.length > 0,
  });
  const ownerOf = (row: Row) => received.data?.find((share) => share.container_id === row.id)?.owner_name;
  const nothing = boards.own.length === 0 && boards.shared.length === 0 && boards.archived.length === 0;

  async function create(name: string): Promise<boolean> {
    // Read anew: the rows shown may not have arrived yet right after the page opened.
    const rows = await localRows(boards.user, "board");
    const id = await createBoard(boards.user, name, newBoardPosition(rows, boards.user));
    if (id) void navigate({ to: "/kanban/$boardId", params: { boardId: id } });
    return id !== null;
  }

  const tiles = (rows: Row[], note?: (row: Row) => string | undefined) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3">
      {rows.map((row) => {
        const line = note?.(row);
        return (
          <li key={String(row.id)}>
            <Link
              to="/kanban/$boardId"
              params={{ boardId: String(row.id) }}
              className="flex min-h-20 flex-col justify-between gap-2 rounded-md border border-line bg-surface p-3 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="line-clamp-2 font-semibold break-words">{String(row.name)}</span>
              {line ? <span className="truncate text-xs text-muted">{line}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const newButton = (
    <Button
      variant="primary"
      onClick={() => {
        setCreating(true);
      }}
    >
      <Plus aria-hidden />
      {t("kanban.new")}
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-2 py-1.5 md:px-4">
        <h1 className="text-lg font-semibold">{t("pages.kanban.title")}</h1>
        {/* On phones New board is the floating button. */}
        {tablet ? <div className="ml-auto">{newButton}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:p-4">
        {!boards.loaded ? null : nothing ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
                <Columns3 className="size-6" aria-hidden />
              </div>
              <h2 className="text-[15px] font-semibold">{t("pages.kanban.emptyTitle")}</h2>
              <p className="text-muted">{t("pages.kanban.emptyBody")}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <section aria-labelledby="boards-own" className="flex flex-col gap-2">
              <h2 id="boards-own" className={HEADING}>
                {t("kanban.own")}
              </h2>
              {boards.own.length > 0 ? (
                tiles(boards.own)
              ) : (
                <p className="text-[13px] text-muted">{t("kanban.noneOwn")}</p>
              )}
            </section>
            {boards.shared.length > 0 ? (
              <section aria-labelledby="boards-shared" className="flex flex-col gap-2">
                <h2 id="boards-shared" className={HEADING}>
                  {t("kanban.shared")}
                </h2>
                {tiles(boards.shared, (row) => {
                  const owner = ownerOf(row);
                  return owner ? t("kanban.sharedBy", { name: owner }) : undefined;
                })}
              </section>
            ) : null}
            {boards.archived.length > 0 ? (
              <details className="flex flex-col gap-2">
                <summary className={`${HEADING} cursor-pointer py-1`}>
                  {t("kanban.archived", { count: boards.archived.length })}
                </summary>
                <div className="pt-2">{tiles(boards.archived)}</div>
              </details>
            ) : null}
          </div>
        )}
      </div>

      {!tablet ? (
        <Button
          variant="primary"
          size="icon"
          aria-label={t("kanban.new")}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 size-14 rounded-full shadow-lg"
          onClick={() => {
            setCreating(true);
          }}
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      ) : null}

      {creating ? (
        <BoardNameDialog
          row={null}
          onSave={create}
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}
