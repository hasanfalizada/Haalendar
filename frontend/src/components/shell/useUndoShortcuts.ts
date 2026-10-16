// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo (FR-X-06). In text
// fields the browser keeps its own text undo; while a dialog is open nothing behind it is undone. Keys are matched by
// event.code, so the shortcuts work with any keyboard layout. The history is bound to the signed-in user; after an
// undo or redo the shown data is refetched.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Registered in the shortcut registry (listed in the "?" overlay).
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useShortcut } from "@/lib/shortcuts";
import { bindUndoUser, redo, subscribeUndoApplied, undo } from "@/lib/undo";

export function useUndoShortcuts(user: string | null): void {
  const queryClient = useQueryClient();
  useEffect(() => subscribeUndoApplied(() => void queryClient.invalidateQueries()), [queryClient]);

  useEffect(() => {
    // Unknown while loading or offline: keep the stored history (sign-out clears it explicitly).
    if (user) bindUndoUser(user);
  }, [user]);

  useShortcut({
    id: "undo",
    keys: ["Mod+Z"],
    group: "editing",
    label: "shortcuts.undo",
    handler: () => void undo(),
  });
  useShortcut({
    id: "redo",
    keys: ["Mod+Shift+Z", "Ctrl+Y"],
    group: "editing",
    label: "shortcuts.redo",
    handler: () => void redo(),
  });
}
