// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. To-Do module placeholder; notes arrive in HAAL-100.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The notes (D-87): `?tab=archive` shows the archive, `?priority=` the
// priority filter (D-46).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. `?note=<id>` opens that note (from its reminder, D-89).
import { createFileRoute } from "@tanstack/react-router";

import type { Priority } from "@/atoms/items/priority";
import { TodoPage } from "@/components/todo/TodoPage";
import type { NotesTab } from "@/lib/notes";
import { formatPriorityParam, parsePriorityParam } from "@/lib/priority";

interface TodoSearch {
  tab?: "archive";
  priority?: string;
  note?: string;
}

function Todo() {
  const { tab, priority, note } = Route.useSearch();
  const notesTab: NotesTab = tab === "archive" ? "archive" : "notes";
  const priorities: Priority[] = parsePriorityParam(priority);
  return <TodoPage tab={notesTab} priorities={priorities} {...(note ? { focusNote: note } : {})} />;
}

export const Route = createFileRoute("/_app/todo")({
  // An explicit undefined: the router merges the parent's raw search params, so a dropped key would come back.
  validateSearch: (search: Record<string, unknown>): TodoSearch => ({
    tab: search.tab === "archive" ? "archive" : undefined,
    priority: formatPriorityParam(parsePriorityParam(search.priority)),
    note: typeof search.note === "string" && /^[0-9a-f-]{36}$/i.test(search.note) ? search.note : undefined,
  }),
  component: Todo,
});
