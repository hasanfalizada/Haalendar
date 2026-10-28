// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Multi-select for lists (FR-X-07, owner decision D-38), first used by
// the trash; HAAL-036 adds bulk actions in the modules on the same hook.
// - click on a checkbox toggles one entry and sets the range anchor; Shift+click selects the range from the anchor;
// - selectAll / clear; Esc clears (unless a dialog is open); a long press (500 ms) toggles an entry on touch screens;
// - entries that leave the list (e.g. after a reload) silently leave the selection.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Row clicks (rowProps): Ctrl/Cmd+click toggles, Shift+click selects
// the range, a plain click opens the row — or toggles it while something is selected on a touch screen (selection
// mode after a long press). The click that ends a long press is swallowed. Ctrl/Cmd+A selects every loaded row of the
// list (option selectAllShortcut; one list per page), not in text fields and not behind a dialog.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Ctrl/Cmd+A and Esc go through the shortcut registry ("?" overlay).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. The row may itself be a button (the day list, a popover trigger):
// clicks that select are prevented, so the trigger does not open its popover as well.
import { type MouseEvent, type PointerEvent, useCallback, useMemo, useRef, useState } from "react";

import { useShortcut } from "./shortcuts";

const LONG_PRESS_MS = 500;

export interface Selection {
  selectedIds: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string, options?: { range?: boolean }) => void;
  selectAll: () => void;
  clear: () => void;
  allSelected: boolean;
  longPress: (id: string) => {
    onPointerDown: (event: PointerEvent) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
  };
  /** Props for a clickable row: long press plus Ctrl/Cmd/Shift clicks; a plain click calls onOpen. */
  rowProps: (
    id: string,
    onOpen?: () => void,
  ) => ReturnType<Selection["longPress"]> & { onClick: (event: MouseEvent) => void };
}

export interface SelectionOptions {
  /** Ctrl/Cmd+A selects all loaded rows of this list (enable for one list per page). */
  selectAllShortcut?: boolean;
}

export function useSelection(ids: readonly string[], options: SelectionOptions = {}): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  const lastPointer = useRef<string>("mouse");

  const selectedIds = useMemo(() => ids.filter((id) => picked.has(id)), [ids, picked]);

  const toggle = useCallback(
    (id: string, options?: { range?: boolean }) => {
      setPicked((current) => {
        const next = new Set(current);
        const from = anchor.current ? ids.indexOf(anchor.current) : -1;
        const to = ids.indexOf(id);
        if (options?.range && from >= 0 && to >= 0) {
          const [start, end] = from < to ? [from, to] : [to, from];
          for (const rangeId of ids.slice(start, end + 1)) next.add(rangeId);
        } else if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      if (!options?.range) anchor.current = id;
    },
    [ids],
  );

  const clear = useCallback(() => {
    setPicked(new Set());
    anchor.current = null;
  }, []);

  const selectAll = useCallback(() => {
    setPicked(new Set(ids));
  }, [ids]);

  const { selectAllShortcut = false } = options;
  useShortcut({
    id: "select-all",
    keys: ["Mod+A"],
    group: "items",
    label: "shortcuts.selectAll",
    handler: selectAll,
    enabled: selectAllShortcut,
  });
  useShortcut({
    id: "clear-selection",
    keys: ["Esc"],
    group: "items",
    label: "shortcuts.clearSelection",
    handler: clear,
    enabled: selectedIds.length > 0,
  });

  const cancelPress = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const longPress = useCallback(
    (id: string) => ({
      onPointerDown: (event: PointerEvent) => {
        lastPointer.current = event.pointerType;
        if (event.pointerType !== "touch") return;
        cancelPress();
        timer.current = setTimeout(() => {
          pressed.current = true;
          toggle(id);
        }, LONG_PRESS_MS);
      },
      onPointerUp: cancelPress,
      onPointerLeave: cancelPress,
    }),
    [cancelPress, toggle],
  );

  const count = selectedIds.length;
  const rowProps = useCallback(
    (id: string, onOpen?: () => void) => ({
      ...longPress(id),
      onClick: (event: MouseEvent) => {
        if (pressed.current) {
          pressed.current = false; // the click that ends a long press
          event.preventDefault();
          return;
        }
        // Checkboxes, buttons and links inside the row handle their own clicks (the row may be a button itself).
        const control =
          event.target instanceof Element ? event.target.closest("button, a, input, select, textarea, label") : null;
        if (control && control !== event.currentTarget) return;
        // A prevented click does not reach handlers composed after this one (e.g. a popover trigger).
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          toggle(id);
        } else if (event.shiftKey) {
          event.preventDefault();
          toggle(id, { range: true });
        } else if (count > 0 && lastPointer.current === "touch") {
          event.preventDefault();
          toggle(id);
        } else {
          onOpen?.();
        }
      },
    }),
    [longPress, toggle, count],
  );

  return {
    selectedIds,
    count,
    isSelected: (id) => picked.has(id),
    toggle,
    selectAll,
    clear,
    allSelected: ids.length > 0 && selectedIds.length === ids.length,
    longPress,
    rowProps,
  };
}
