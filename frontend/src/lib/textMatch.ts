// +++===+++ 2026-11-26 16:50 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). Matching words as the search does (case and
// accents ignored, every word of the query begins a word of the text), apart from lib/search, whose excerpts need the
// Markdown code: links, board filters and the palette's commands use only this, and they are in the start bundle.
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
export function wordStart(text: string, word: string, from = 0): number {
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
