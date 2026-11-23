// +++===+++ 2026-11-23 14:10 +04 — Hasan Alizada — HAAL-039 (D-119). Whether the search is open: one search window in
// the app shell, opened by the search field of any header or by "/".
import { useSyncExternalStore } from "react";

import { NO_FILTER, type SearchFilter } from "@/lib/searchFilter";

let open = false;
const listeners = new Set<() => void>();

export function setSearchOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => {
    listener();
  });
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

// +++===+++ 2026-11-24 11:30 +04 — Hasan Alizada — HAAL-046 (D-120). The search filters stay while the tab is open
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
