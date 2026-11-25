// +++===+++ 2026-11-23 13:10 +04 — Hasan Alizada — HAAL-039 (D-119). Search over the items on this device (FR-X-10,
// FR-CAL-21), without React and without a library:
// - case and accents do not matter ("cafe" finds "Café"); every word of the query must begin a word of the item (its
//   title, place, description or checklist items), in any order ("plan spr" finds "Sprint planning");
// - ranked: a word in the title counts most, at the title's start more still, then the place, then the description
//   and the checklist; ties by title;
// - deleted items, events of calendars the views do not show and cards of deleted boards are left out;
// - the folded text of an item is kept per row object, so typing does not fold every item again.
// +++===+++ 2026-11-25 09:45 +04 — Hasan Alizada — HAAL-114 (D-123). And the comments of cards, ranked last.
type Row = Record<string, unknown>;

export type SearchModule = "calendar" | "todo" | "kanban";
export type SearchField = "title" | "location" | "body" | "checklist" | "comments";
export type OtherField = Exclude<SearchField, "title">;

export interface SearchHit {
  row: Row;
  module: SearchModule;
  score: number;
  /** Where the words were found besides the title (the first such field), for the line under the title. */
  field: OtherField | null;
}

export interface SearchInput {
  items: readonly Row[];
  checklistItems: readonly Row[];
  /** Card comments (none: no comments searched). */
  comments?: readonly Row[];
  boards: readonly Row[];
  /** The calendar is shown in the views (neither archived nor hidden). */
  calendarShown: (id: unknown) => boolean;
}

export type SearchResults = Record<SearchModule, SearchHit[]>;

const MODULE_OF: Record<string, SearchModule> = { event: "calendar", note: "todo", card: "kanban" };
const WEIGHT: Record<SearchField, number> = { title: 8, location: 4, body: 2, checklist: 2, comments: 1 };
const MARKS = /\p{M}/gu;
// eslint-disable-next-line no-control-regex -- the whole ASCII range on purpose
const ASCII = /^[\x00-\x7f]*$/;

/** Lower case without accents: the form both the query and the items are compared in. */
export function fold(text: string): string {
  // Plain ASCII has no accents to drop: lower case only, several times faster on a cold search of many items.
  if (ASCII.test(text)) return text.toLowerCase();
  return text.normalize("NFKD").replace(MARKS, "").toLocaleLowerCase();
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** The words of a query, folded; punctuation around them dropped. */
export function queryWords(query: string): string[] {
  return fold(query)
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word !== "");
}

/** Where `word` begins a word of `text` (both folded); -1 when it does not. */
function wordStart(text: string, word: string, from = 0): number {
  let at = text.indexOf(word, from);
  while (at !== -1) {
    if (at === 0 || !WORD_CHAR.test(text[at - 1] ?? "")) return at;
    at = text.indexOf(word, at + 1);
  }
  return -1;
}

/** Every word of the query begins a word of the text (case and accents ignored); an empty query matches. */
export function matchesQuery(text: string, query: string): boolean {
  const folded = fold(text);
  return queryWords(query).every((word) => wordStart(folded, word) !== -1);
}

/**
 * The parts of `text` to highlight for the query: [start, end) of every place a query word begins a word, merged.
 * Computed on the shown text, character by character, so accents and case do not move them.
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  // The folded text with, for each of its characters, the index in `text` it came from.
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i) ?? 0;
    const width = code > 0xffff ? 2 : 1;
    const part = fold(text.slice(i, i + width));
    folded += part;
    for (let k = 0; k < part.length; k += 1) origin.push(i);
    i += width;
  }
  origin.push(text.length);
  const ranges: [number, number][] = [];
  for (const word of words) {
    for (let at = wordStart(folded, word); at !== -1; at = wordStart(folded, word, at + 1)) {
      const end = at + word.length;
      // The end in `text`: the start of the next folded character's source, or the end of the text.
      ranges.push([origin[at] ?? 0, end < origin.length - 1 ? (origin[end] ?? text.length) : text.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

interface Folded {
  title: string;
  location: string;
  body: string;
  checklist: string;
  comments: string;
  /** All of them, for the quick check that every word is there at all. */
  all: string;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
let cache = new WeakMap<Row, Folded>();
let cachedChecklists: readonly Row[] | null = null;
let cachedComments: readonly Row[] | undefined;

function foldedOf(row: Row, checklist: string, commentText: string): Folded {
  let entry = cache.get(row);
  if (!entry) {
    const title = fold(text(row.title));
    const location = fold(text(row.location));
    const body = fold(text(row.body));
    const list = fold(checklist);
    const comments = fold(commentText);
    entry = {
      title,
      location,
      body,
      checklist: list,
      comments,
      all: `${title}\n${location}\n${body}\n${list}\n${comments}`,
    };
    cache.set(row, entry);
  }
  return entry;
}

/** The live texts (`field`) of the rows belonging to each item, one a line. */
function textsByItem(rows: readonly Row[], field: string): Map<string, string> {
  const byItem = new Map<string, string>();
  for (const row of rows) {
    if (row.deleted_at) continue;
    const id = String(row.item_id);
    const line = text(row[field]);
    byItem.set(id, byItem.has(id) ? `${byItem.get(id) ?? ""}\n${line}` : line);
  }
  return byItem;
}

/** The score of a row for the words, and the first field besides the title they were found in; null: no match. */
function scoreOf(folded: Folded, words: readonly string[]): { score: number; field: OtherField | null } | null {
  let score = 0;
  let field: OtherField | null = null;
  for (const word of words) {
    let best = 0;
    for (const name of ["title", "location", "body", "checklist", "comments"] as const) {
      const at = wordStart(folded[name], word);
      if (at === -1) continue;
      const weight = WEIGHT[name] + (name === "title" && at === 0 ? 4 : 0);
      if (weight > best) best = weight;
      if (name !== "title" && field === null && wordStart(folded.title, word) === -1) field = name;
    }
    if (best === 0) return null;
    score += best;
  }
  return { score, field };
}

/** What the filters of the search (searchFilter.ts, HAAL-046) give the search. */
export interface ResultFilter {
  active: boolean;
  modules: ReadonlySet<SearchModule>;
  keep: (row: Row, module: SearchModule) => boolean;
  dayOf: (row: Row) => string | null;
}

/**
 * The items matching the query and the filter, by module, best first, at most `limit` in each. Without words only an
 * active filter finds anything, and then the results go by their day (HAAL-046).
 */
export function searchItems(input: SearchInput, query: string, limit = 20, filter?: ResultFilter): SearchResults {
  const results: SearchResults = { calendar: [], todo: [], kanban: [] };
  const words = queryWords(query);
  const byFilterOnly = words.length === 0;
  if (byFilterOnly && !filter?.active) return results;
  // Checklist and comment text belongs to its item: a change of either folds the items again.
  if (cachedChecklists !== input.checklistItems || cachedComments !== input.comments) {
    cache = new WeakMap();
    cachedChecklists = input.checklistItems;
    cachedComments = input.comments;
  }
  const lists = textsByItem(input.checklistItems, "text");
  const comments = textsByItem(input.comments ?? [], "body");
  const deletedBoards = new Set(input.boards.filter((board) => board.deleted_at).map((board) => String(board.id)));
  for (const row of input.items) {
    const module = MODULE_OF[text(row.kind)];
    if (!module || row.deleted_at) continue;
    if (module === "calendar" && !input.calendarShown(row.container_id)) continue;
    if (module === "kanban" && deletedBoards.has(String(row.container_id))) continue;
    if (filter && (!filter.modules.has(module) || !filter.keep(row, module))) continue;
    if (byFilterOnly) {
      results[module].push({ row, module, score: 0, field: null });
      continue;
    }
    const folded = foldedOf(row, lists.get(String(row.id)) ?? "", comments.get(String(row.id)) ?? "");
    if (!words.every((word) => folded.all.includes(word))) continue;
    const found = scoreOf(folded, words);
    if (found) results[module].push({ row, module, score: found.score, field: found.field });
  }
  const dayOf = filter?.dayOf;
  const byDay = (a: SearchHit, b: SearchHit) => {
    if (!byFilterOnly || !dayOf) return 0;
    const [x, y] = [dayOf(a.row), dayOf(b.row)];
    return x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
  };
  for (const module of Object.keys(results) as SearchModule[]) {
    results[module] = results[module]
      .sort((a, b) => b.score - a.score || byDay(a, b) || text(a.row.title).localeCompare(text(b.row.title)))
      .slice(0, limit);
  }
  return results;
}

/** The text of a field of a hit (the checklist: its items, one a line; the comments: one a paragraph). */
export function fieldText(
  row: Row,
  field: OtherField,
  checklistItems: readonly Row[],
  comments: readonly Row[] = [],
): string {
  if (field === "comments") {
    return comments
      .filter((comment) => comment.item_id === row.id && !comment.deleted_at)
      .map((comment) => text(comment.body))
      .join("\n\n");
  }
  if (field === "checklist") {
    return checklistItems
      .filter((item) => item.item_id === row.id && !item.deleted_at)
      .map((item) => text(item.text))
      .join("\n");
  }
  return text(row[field]);
}

/** A part of `source` around the first place a query word begins a word, at most `length` characters. */
export function snippet(source: string, query: string, length = 90): string {
  const flat = source.replace(/\s+/g, " ").trim();
  const first = highlightRanges(flat, query)[0];
  if (!first || flat.length <= length) return flat;
  const start = Math.max(0, Math.min(first[0] - Math.floor(length / 3), flat.length - length));
  const space = start === 0 ? 0 : flat.indexOf(" ", start) + 1 || start;
  const end = Math.min(flat.length, space + length);
  return `${space > 0 ? "…" : ""}${flat.slice(space, end).trimEnd()}${end < flat.length ? "…" : ""}`;
}
