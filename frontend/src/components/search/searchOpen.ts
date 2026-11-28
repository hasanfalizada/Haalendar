// +++===+++ 2026-11-23 14:10 +04 — Hasan Alizada — HAAL-039 (D-119). Whether the search is open: one search window in
// the app shell, opened by the search field of any header or by "/".
import { useSyncExternalStore } from "react";

import { NO_FILTER, type SearchFilter } from "@/lib/searchFilterShape";

let open = false;
const listeners = new Set<() => void>();

// +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The same window is the command palette: opened by
// Ctrl+K (and on phones by the search field) it lists the commands while the field is empty and puts the matching ones
// and "Create …" with the typed words before the results; opened by "/" or the field of a header it is the search.
export type SearchMode = "search" | "commands";
let mode: SearchMode = "search";

export function setSearchOpen(next: boolean, nextMode: SearchMode = "search"): void {
  if (open === next && (!next || mode === nextMode)) return;
  open = next;
  if (next) mode = nextMode;
  listeners.forEach((listener) => {
    listener();
  });
}

export function useSearchMode(): SearchMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => mode,
  );
}

/** Whether the window is open as the command palette (for Ctrl+K pressed again). */
export function searchMode(): SearchMode | null {
  return open ? mode : null;
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => open,
  );
}

// A result was opened: its page takes the focus, so the closing window does not give it back to the search field.
let leaving = false;

/** Close the search for a result that opens another page. */
export function closeSearchForResult(): void {
  leaving = true;
  setSearchOpen(false);
}

/** Whether the search closed for a result (asked once, as it closes). */
export function closedForResult(): boolean {
  const was = leaving;
  leaving = false;
  return was;
}

// +++===+++ 2026-11-23 11:30 +04 — Hasan Alizada — HAAL-046 (D-120). The search filters stay while the tab is open
// (closing and opening the search keeps them); Reset clears them.
let filter: SearchFilter = NO_FILTER;
const filterListeners = new Set<() => void>();

export function setSearchFilter(next: SearchFilter): void {
  filter = next;
  filterListeners.forEach((listener) => {
    listener();
  });
}

export function useSearchFilter(): SearchFilter {
  return useSyncExternalStore(
    (listener) => {
      filterListeners.add(listener);
      return () => {
        filterListeners.delete(listener);
      };
    },
    () => filter,
  );
}
