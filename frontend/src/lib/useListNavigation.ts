// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Keyboard navigation in a list (FR-X-08, design system section 8): one
// Tab stop for the list (roving tabindex), ↑/↓ move the focus, Home/End jump, Shift+↑/↓ extend the selection, Space
// selects, Enter or E opens, Delete deletes the selection — or the focused row — through the caller (who confirms, as
// the legacy app did: F-16). Keys pressed on a row's own controls (checkbox, buttons) keep their native meaning; only
// the arrows move on from there. The keys are listed in the "?" overlay while the list is shown.
import { type KeyboardEvent, useCallback, useRef, useState } from "react";

import { useShortcut } from "./shortcuts";
import type { Selection } from "./useSelection";

interface ListNavigationOptions {
  onOpen?: (id: string) => void;
  /** Delete key: the selected rows, or the focused row when nothing is selected. */
  onDelete?: (ids: string[]) => void;
  /** Label of what Enter does in this list (translation key), e.g. "shortcuts.restore". */
  openLabel?: string;
}

export function useListNavigation(ids: readonly string[], selection: Selection, options: ListNavigationOptions = {}) {
  const { onOpen, onDelete, openLabel = "shortcuts.open" } = options;
  const [active, setActive] = useState<string | null>(null);
  const container = useRef<HTMLElement | null>(null);
  const current = active !== null && ids.includes(active) ? active : (ids[0] ?? null);

  const focusRow = useCallback((id: string) => {
    setActive(id);
    container.current?.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(id)}"]`)?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const row = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-nav-id]") : null;
      const id = row?.dataset.navId;
      if (!row || id === undefined) return;
      const onRow = event.target === row;
      const index = ids.indexOf(id);
      const move = (to: number) => {
        const next = ids[Math.max(0, Math.min(ids.length - 1, to))];
        if (next === undefined) return;
        event.preventDefault();
        if (event.shiftKey) {
          if (!selection.isSelected(id)) selection.toggle(id);
          selection.toggle(next, { range: true });
        }
        focusRow(next);
      };
      switch (event.key) {
        case "ArrowDown":
          move(index + 1);
          return;
        case "ArrowUp":
          move(index - 1);
          return;
        case "Home":
          move(0);
          return;
        case "End":
          move(ids.length - 1);
          return;
        default:
          break;
      }
      if (!onRow || event.shiftKey) return;
      if (event.key === " ") {
        event.preventDefault();
        selection.toggle(id);
      } else if ((event.key === "Enter" || event.code === "KeyE") && onOpen) {
        event.preventDefault();
        onOpen(id);
      } else if (event.key === "Delete" && onDelete) {
        event.preventDefault();
        onDelete(selection.count > 0 ? selection.selectedIds : [id]);
      }
    },
    [ids, selection, focusRow, onOpen, onDelete],
  );

  const listRef = useCallback((node: HTMLElement | null) => {
    container.current = node;
  }, []);

  // Listed in the overlay; the list handles the keys itself (they depend on the focused row).
  useShortcut({ id: "list-move", keys: ["Up", "Down"], group: "items", label: "shortcuts.listMove" });
  useShortcut({ id: "list-jump", keys: ["Home", "End"], group: "items", label: "shortcuts.listJump" });
  useShortcut({ id: "list-extend", keys: ["Shift+Up", "Shift+Down"], group: "items", label: "shortcuts.listExtend" });
  useShortcut({ id: "list-select", keys: ["Space"], group: "items", label: "shortcuts.listSelect" });
  useShortcut({
    id: "list-open",
    keys: ["Enter", "E"],
    group: "items",
    label: openLabel,
    enabled: onOpen !== undefined,
  });
  useShortcut({
    id: "list-delete",
    keys: ["Delete"],
    group: "items",
    label: "shortcuts.listDelete",
    enabled: onDelete !== undefined,
  });

  return {
    listProps: { ref: listRef, onKeyDown },
    itemProps: (id: string) => ({
      "data-nav-id": id,
      tabIndex: id === current ? 0 : -1,
      onFocus: () => {
        setActive(id);
      },
    }),
  };
}
