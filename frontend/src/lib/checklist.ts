// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Checklists of notes (FR-TODO-02, D-88): the items of a note from the
// local database (unchecked first, the checked ones at the bottom, each group by position), the editor's list as a
// form value and what saving it writes — new items, changed text / check / order, removed (or emptied) items.
// Positions stay where the order allows and only moved or new items get a new key between their neighbours.
import { comparePositions, keyBetween } from "./position";

type Row = Record<string, unknown>;

export const MAX_ITEMS = 200;
export const TEXT_MAX = 500;
/** Unchecked items shown on a card. */
export const CARD_ITEMS = 8;

export interface ChecklistEntry {
  id: string;
  text: string;
  checked: boolean;
}

export interface ChecklistGroups {
  unchecked: Row[];
  checked: Row[];
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

function byPosition(a: Row, b: Row): number {
  return comparePositions(str(a.position), str(b.position)) || comparePositions(str(a.id), str(b.id));
}

export function checklistOf(rows: readonly Row[], noteId: string): ChecklistGroups {
  const live = rows.filter((row) => row.item_id === noteId && !row.deleted_at).sort(byPosition);
  return { unchecked: live.filter((row) => row.checked !== true), checked: live.filter((row) => row.checked === true) };
}

/** Where an item goes back among the unchecked ones when it is unchecked: before the first with a later position. */
export function uncheckedIndex(
  entries: readonly ChecklistEntry[],
  position: string | null,
  positionOf: (id: string) => string | null,
): number {
  const unchecked = entries.filter((entry) => !entry.checked);
  if (position === null) return unchecked.length;
  const index = unchecked.findIndex((entry) => {
    const other = positionOf(entry.id);
    return other !== null && comparePositions(other, position) > 0;
  });
  return index === -1 ? unchecked.length : index;
}

/** The editor's list (unchecked, then checked) of a note's items. */
export function entriesOf(groups: ChecklistGroups): ChecklistEntry[] {
  return [...groups.unchecked, ...groups.checked].map((row) => ({
    id: str(row.id),
    text: str(row.text),
    checked: row.checked === true,
  }));
}

/** Keys in the given order: an existing key is kept while it still fits between its neighbours. */
export function reposition(order: readonly (string | null)[]): string[] {
  const keys: string[] = [];
  let previous = "";
  order.forEach((own, index) => {
    const upper =
      order
        .slice(index + 1)
        .filter((key): key is string => key !== null && comparePositions(key, previous) > 0)
        .sort(comparePositions)[0] ?? null;
    const fits =
      own !== null && comparePositions(own, previous) > 0 && (upper === null || comparePositions(own, upper) < 0);
    const key = fits ? own : keyBetween(previous, upper);
    keys.push(key);
    previous = key;
  });
  return keys;
}

export interface ChecklistChanges {
  create: { id: string; data: Row }[];
  update: { id: string; base: Row; data: Row }[];
  remove: string[];
}

/** What saving the editor's list writes for a note whose stored items are `stored`. */
export function checklistChanges(noteId: string, stored: readonly Row[], entries: readonly ChecklistEntry[]) {
  const before = new Map(stored.map((row) => [str(row.id), row]));
  const kept = entries.map((entry) => ({ ...entry, text: entry.text.trim() })).filter((entry) => entry.text !== "");
  // The order the user sees is kept by the unchecked items' positions; a checked item keeps its own, so unchecking it
  // later puts it back where it was.
  const unchecked = kept.filter((entry) => !entry.checked);
  const checked = kept.filter((entry) => entry.checked);
  const storedKey = (entry: ChecklistEntry) => {
    const row = before.get(entry.id);
    return row ? str(row.position) : null;
  };
  const uncheckedKeys = reposition(unchecked.map(storedKey));
  let last = uncheckedKeys[uncheckedKeys.length - 1] ?? "";
  const checkedKeys = checked.map((entry) => {
    const own = storedKey(entry);
    if (own !== null) return own;
    last = keyBetween(last, null);
    return last;
  });
  const ordered = [...unchecked, ...checked];
  const keys = [...uncheckedKeys, ...checkedKeys];
  const changes: ChecklistChanges = { create: [], update: [], remove: [] };
  ordered.forEach((entry, index) => {
    const position = keys[index] ?? "U";
    const row = before.get(entry.id);
    if (!row) {
      changes.create.push({
        id: entry.id,
        data: { item_id: noteId, text: entry.text, checked: entry.checked, position },
      });
      return;
    }
    const now: Row = { text: entry.text, checked: entry.checked, position };
    const changed = Object.keys(now).filter((name) => now[name] !== (row[name] ?? (name === "checked" ? false : "")));
    if (changed.length > 0) {
      changes.update.push({
        id: entry.id,
        base: Object.fromEntries(changed.map((name) => [name, row[name] ?? null])),
        data: Object.fromEntries(changed.map((name) => [name, now[name]])),
      });
    }
  });
  const left = new Set(ordered.map((entry) => entry.id));
  changes.remove = [...before.keys()].filter((id) => !left.has(id));
  return changes;
}
