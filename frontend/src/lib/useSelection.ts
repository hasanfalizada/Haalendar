// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Multi-select for lists (FR-X-07, owner decision D-38), first used by
// the trash; HAAL-036 adds bulk actions in the modules on the same hook.
// - click on a checkbox toggles one entry and sets the range anchor; Shift+click selects the range from the anchor;
// - selectAll / clear; Esc clears (unless a dialog is open); a long press (500 ms) toggles an entry on touch screens;
// - entries that leave the list (e.g. after a reload) silently leave the selection.
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
}

export function useSelection(ids: readonly string[]): Selection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (selectedIds.length === 0) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector('[role="dialog"]')) clear();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [selectedIds.length, clear]);

  const cancelPress = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const longPress = useCallback(
    (id: string) => ({
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType !== "touch") return;
        cancelPress();
        timer.current = setTimeout(() => {
          toggle(id);
        }, LONG_PRESS_MS);
      },
      onPointerUp: cancelPress,
      onPointerLeave: cancelPress,
    }),
    [cancelPress, toggle],
  );

  return {
    selectedIds,
    count: selectedIds.length,
    isSelected: (id) => picked.has(id),
    toggle,
    selectAll,
    clear,
    allSelected: ids.length > 0 && selectedIds.length === ids.length,
    longPress,
  };
}
