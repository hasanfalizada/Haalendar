// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. Opens the shortcut overlay from elsewhere (Help in the user menu):
// the mounted overlay registers its opener here. returnFocus: where the focus goes when the overlay closes, for an
// opener that is gone by then (the Help dialog closes when the overlay opens).
type Opener = (returnFocus?: () => void) => void;

const openers = new Set<Opener>();

/** Registers an opener; returns the function that removes it. */
export function registerShortcutsOverlay(open: Opener): () => void {
  openers.add(open);
  return () => {
    openers.delete(open);
  };
}

/** Opens the shortcut overlay of the mounted shell (no-op when none is mounted). */
export function openShortcutsOverlay(returnFocus?: () => void): void {
  for (const open of openers) open(returnFocus);
}
