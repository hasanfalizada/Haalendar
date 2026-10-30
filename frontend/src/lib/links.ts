// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Links between items on the device (FR-INT-01, D-98), without React:
// - the items linked to one item (either end: a backlink is the same link seen from the other side) — open, in the
//   trash, or closed to the user (not on the device: only its id travelled);
// - the items that can still be linked to it: live events, notes and cards on the device, not itself, not linked yet,
//   whose title has the text typed;
// - where an item opens: an event on its day, a note on the To-Do page, a card on its board.
type Row = Record<string, unknown>;

export const LINKED_KINDS = ["event", "note", "card"] as const;
export type LinkedKind = (typeof LINKED_KINDS)[number];

export interface LinkedItem {
  linkId: string;
  itemId: string;
  /** The other item's row; undefined when it is closed to the user. */
  row: Row | undefined;
  state: "open" | "trash" | "closed";
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");
const isLinkable = (row: Row) => (LINKED_KINDS as readonly unknown[]).includes(row.kind);

/** The live links of an item and what is at their other end: open ones first (by title), then the trash, then closed. */
export function linkedItems(links: readonly Row[], items: readonly Row[], itemId: string): LinkedItem[] {
  const byId = new Map(items.map((row) => [String(row.id), row]));
  const found = links
    .filter((link) => !link.deleted_at && (link.from_item_id === itemId || link.to_item_id === itemId))
    .map((link): LinkedItem => {
      const other = String(link.from_item_id === itemId ? link.to_item_id : link.from_item_id);
      const row = byId.get(other);
      return {
        linkId: String(link.id),
        itemId: other,
        row,
        state: !row ? "closed" : row.deleted_at ? "trash" : "open",
      };
    });
  const rank = { open: 0, trash: 1, closed: 2 } as const;
  return found.sort(
    (a, b) => rank[a.state] - rank[b.state] || textOf(a.row?.title).localeCompare(textOf(b.row?.title)),
  );
}

/** Items that can be linked to `itemId`, whose title or text holds `query` (case ignored), by title; at most `limit`. */
export function linkCandidates(
  items: readonly Row[],
  links: readonly Row[],
  itemId: string,
  query: string,
  limit = 50,
): Row[] {
  const linked = new Set(linkedItems(links, items, itemId).map((entry) => entry.itemId));
  const needle = query.trim().toLocaleLowerCase();
  return items
    .filter(
      (row) =>
        isLinkable(row) &&
        !row.deleted_at &&
        row.id !== itemId &&
        !linked.has(String(row.id)) &&
        (!needle || `${textOf(row.title)}\n${textOf(row.body)}`.toLocaleLowerCase().includes(needle)),
    )
    .sort((a, b) => textOf(a.title).localeCompare(textOf(b.title)))
    .slice(0, limit);
}

export type ItemTarget =
  | { to: "/calendar"; search: { date: string; view: "day"; event: string } }
  | { to: "/todo"; search: { note: string } }
  | { to: "/kanban/$boardId"; params: { boardId: string }; search: { card: string } };

/** Where an item opens; null for one that cannot be opened (another kind, no date). */
export function itemTarget(row: Row): ItemTarget | null {
  const id = String(row.id);
  if (row.kind === "note") return { to: "/todo", search: { note: id } };
  if (row.kind === "card" && typeof row.container_id === "string") {
    return { to: "/kanban/$boardId", params: { boardId: row.container_id }, search: { card: id } };
  }
  if (row.kind === "event" && typeof row.start_date === "string") {
    return { to: "/calendar", search: { date: row.start_date, view: "day", event: id } };
  }
  return null;
}
