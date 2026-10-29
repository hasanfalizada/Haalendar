// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. One Kanban board (D-90).
import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "@/components/kanban/BoardPage";

function Board() {
  const { boardId } = Route.useParams();
  return <BoardPage key={boardId} boardId={boardId} />;
}

export const Route = createFileRoute("/_app/kanban/$boardId")({ component: Board });
