// +++===+++ 2026-11-12 00:05 +04 — Hasan Alizada — HAAL-174 (UAT finding F14). The colour picker of the details card waits 0.6 s before
// it writes; Ctrl+Z in the card first writes a choice still waiting, so the undo takes back the colour just picked.

// Writers of the colour pickers on screen (one card is open at a time, the set keeps it simple).
const waiting = new Set<() => Promise<void>>();

/** Registers a writer of a waiting choice; returns the function that removes it. */
export function waitingColor(write: () => Promise<void>): () => void {
  waiting.add(write);
  return () => {
    waiting.delete(write);
  };
}

/** Writes a colour choice still waiting for its delay; resolves once the write and its undo step are recorded. */
export async function flushEventColor(): Promise<void> {
  await Promise.all([...waiting].map((write) => write()));
}
