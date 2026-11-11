// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. Count of editors with unsaved changes, for the browser's "leave
// site?" prompt (FR-X-09). The tab-close guard of api/write.ts asks while this is above zero or a write is in flight.
let dirtyEditors = 0;

/** Mark one editor as having unsaved changes; call the returned function when it is clean again or unmounted. */
export function markDirty(): () => void {
  dirtyEditors += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    dirtyEditors -= 1;
  };
}

export function dirtyEditorCount(): number {
  return dirtyEditors;
}
