// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo (FR-X-06). In text
// fields the browser keeps its own text undo; while a dialog is open nothing behind it is undone. Keys are matched by
// event.code, so the shortcuts work with any keyboard layout. The history is bound to the signed-in user; after an
// undo or redo the shown data is refetched.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { log } from "@/lib/log";
import { bindUndoUser, redo, subscribeUndoApplied, undo } from "@/lib/undo";

import { isTypingTarget } from "./useModuleShortcuts";

export function useUndoShortcuts(user: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => subscribeUndoApplied(() => void queryClient.invalidateQueries()), [queryClient]);

  useEffect(() => {
    // Unknown while loading or offline: keep the stored history (sign-out clears it explicitly).
    if (user) bindUndoUser(user);
  }, [user]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      const isRedo =
        (event.code === "KeyZ" && event.shiftKey) || (event.code === "KeyY" && event.ctrlKey && !event.shiftKey);
      const isUndo = event.code === "KeyZ" && !event.shiftKey;
      if (!isUndo && !isRedo) return;
      event.preventDefault();
      log.debug("shortcut_undo", { redo: isRedo });
      void (isRedo ? redo() : undo());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
