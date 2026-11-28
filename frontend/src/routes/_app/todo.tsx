// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. To-Do module placeholder; notes arrive in HAAL-100.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. The notes (D-87): `?tab=archive` shows the archive, `?priority=` the
// priority filter (D-46).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. `?note=<id>` opens that note (from its reminder, D-89).
// +++===+++ 2026-11-17 22:40 +04 — Hasan Alizada — HAAL-102. `?labels=<id>,<id>` filters by the user's labels (D-109).
import { createFileRoute } from "@tanstack/react-router";

import type { Priority } from "@/atoms/items/priority";
import { TodoPage } from "@/components/todo/TodoPage";
import { type NotesTab, formatLabelsParam, parseLabelsParam } from "@/lib/notes";
import { formatPriorityParam, parsePriorityParam } from "@/lib/priority";

interface TodoSearch {
  tab?: "archive";
  priority?: string;
  labels?: string;
  note?: string;
  // +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The command palette asks for a new note or list, with its title.
  new?: "note" | "list";
  title?: string;
}

function Todo() {
  const { tab, priority, labels, note, new: create, title } = Route.useSearch();
  const notesTab: NotesTab = tab === "archive" ? "archive" : "notes";
  const priorities: Priority[] = parsePriorityParam(priority);
  return (
    <TodoPage
      tab={notesTab}
      priorities={priorities}
      labelFilter={parseLabelsParam(labels)}
      {...(note ? { focusNote: note } : {})}
      {...(create ? { createNote: { list: create === "list", title: title ?? "" } } : {})}
    />
  );
}

export const Route = createFileRoute("/_app/todo")({
  // An explicit undefined: the router merges the parent's raw search params, so a dropped key would come back.
  validateSearch: (search: Record<string, unknown>): TodoSearch => ({
    tab: search.tab === "archive" ? "archive" : undefined,
    priority: formatPriorityParam(parsePriorityParam(search.priority)),
    labels: formatLabelsParam(parseLabelsParam(search.labels)),
    note: typeof search.note === "string" && /^[0-9a-f-]{36}$/i.test(search.note) ? search.note : undefined,
    new: search.new === "note" || search.new === "list" ? search.new : undefined,
    title: typeof search.title === "string" ? search.title.slice(0, 500) : undefined,
  }),
  component: Todo,
});
