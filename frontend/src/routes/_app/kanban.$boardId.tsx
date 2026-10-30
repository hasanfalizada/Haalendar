// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. One Kanban board (D-90).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. `?card=<id>` opens that card (from its reminder, D-94).
import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "@/components/kanban/BoardPage";

interface BoardSearch {
  card?: string;
}

function Board() {
  const { boardId } = Route.useParams();
  const { card } = Route.useSearch();
  return <BoardPage key={boardId} boardId={boardId} {...(card ? { focusCard: card } : {})} />;
}

export const Route = createFileRoute("/_app/kanban/$boardId")({
  // An explicit undefined: the router merges the parent's raw search params, so a dropped key would come back.
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    card: typeof search.card === "string" && /^[0-9a-f-]{36}$/i.test(search.card) ? search.card : undefined,
  }),
  component: Board,
});
