// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. One Kanban board (D-90).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. `?card=<id>` opens that card (from its reminder, D-94).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. The board filters live in the address too (D-96):
// `?labels=…&priority=…&due=…&q=…`.
// +++===+++ 2026-11-27 — Hasan Alizada — HAAL-115. And the swimlanes (D-130): `?lanes=priority|assignee|label`.
import { createFileRoute } from "@tanstack/react-router";

import { BoardPage } from "@/components/kanban/BoardPage";
import { type BoardFilterSearch, formatBoardFilter, parseBoardFilter } from "@/lib/boardFilter";
import { parseLanes } from "@/lib/lanes";

interface BoardSearch extends BoardFilterSearch {
  card?: string | undefined;
  lanes?: string | undefined;
}

function Board() {
  const { boardId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <BoardPage
      key={boardId}
      boardId={boardId}
      filter={parseBoardFilter(search)}
      lanes={parseLanes(search.lanes)}
      {...(search.card ? { focusCard: search.card } : {})}
    />
  );
}

export const Route = createFileRoute("/_app/kanban/$boardId")({
  // An explicit undefined: the router merges the parent's raw search params, so a dropped key would come back.
  validateSearch: (search: Record<string, unknown>): BoardSearch => ({
    card: typeof search.card === "string" && /^[0-9a-f-]{36}$/i.test(search.card) ? search.card : undefined,
    lanes: parseLanes(search.lanes) ?? undefined,
    ...formatBoardFilter(parseBoardFilter(search as BoardFilterSearch)),
  }),
  component: Board,
});
