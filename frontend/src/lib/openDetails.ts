// +++===+++ 2026-11-19 10:05 +04 — Hasan Alizada — HAAL-189. A card belongs to the place it was opened from: an event
// over several days is shown on each of them, and two open cards closed each other at once; and a card closes only
// itself, so the click on another event, which closes the open card and opens its own, opens it with one click.
/** The open card: the entry (its key) and the day it was opened on; null for wherever the entry is shown (one place). */
export interface OpenDetails {
  key: string;
  place: string | null;
}

export function isOpenAt(open: OpenDetails | null, key: string, place: string): boolean {
  return open !== null && open.key === key && (open.place === null || open.place === place);
}
