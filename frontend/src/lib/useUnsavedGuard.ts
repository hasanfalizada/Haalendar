// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. Unsaved-changes guard for an editor (FR-X-09, D-43). While `dirty`:
// - leaving the page inside the app (link, module switch Alt+1..3, browser back) is held by the router's blocker and
//   asks first;
// - closing a dialog editor (Esc, backdrop, close button, Cancel) goes through requestClose(), which asks first;
// - closing or reloading the tab triggers the browser's own prompt (api/write.ts tab-close guard).
// Answers: keep editing (default), leave (only for editors with a local draft: the draft stays and is offered next
// time) or discard the changes. Without changes nothing is asked. Ctrl/Cmd+Enter saves (`onSave`), listed in "?".
// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-080. leave(): the editor itself leaves on purpose (e.g. to show another
// event) — the same as answering "Leave" (onLeave, then nothing is held any more), without asking.
// +++===+++ 2026-11-20 10:30 +04 — Hasan Alizada — HAAL-190 (D-116). Ctrl/Cmd+S saves as well, as in most programs:
// while an editor is open the browser's "Save page as" never opens — without changes the key does nothing, and on a
// page of several editors with the focus in none of them a shared catch-all takes it. Both keys are listed in "?"
// while the editor is open, and the Save button names Ctrl/Cmd+S (`saveHint`: tooltip and aria-keyshortcuts).
import { type AnyRouter, type RouterHistory, useRouter } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { log } from "./log";
import { IS_APPLE, keyCaps, matches, registerShortcut, useShortcut } from "./shortcuts";
import { markDirty } from "./unsaved";

interface UnsavedGuardOptions {
  dirty: boolean;
  /** The editor keeps a local draft (useDraft): offer "Leave" besides "Discard". */
  hasDraft?: boolean;
  /** Called on "Discard changes" before leaving (e.g. delete the draft, reset the fields). */
  onDiscard?: () => void | Promise<void>;
  /** Called on "Leave" before leaving (e.g. write the draft at once). */
  onLeave?: () => void | Promise<void>;
  /** Ctrl/Cmd+S or Ctrl/Cmd+Enter saves the editor (while it has changes and the focus is inside `scope`). */
  onSave?: () => void;
  scope?: RefObject<HTMLElement | null>;
  /** The editor is a dialog: Ctrl/Cmd+S and Ctrl/Cmd+Enter work inside it. */
  inDialog?: boolean;
}

const SAVE_KEYS = ["Mod+S", "Mod+Enter"] as const;

/** Props of an editor's Save button that name the key: a tooltip and, for screen readers, aria-keyshortcuts. */
export const saveHint = {
  title: keyCaps("Mod+S").join("+"),
  "aria-keyshortcuts": IS_APPLE ? "Meta+S" : "Control+S",
} as const;

// One catch-all for Ctrl/Cmd+S while any editor is open, registered before the editors' own keys (the newest
// registration is asked first), so it only takes the key no editor took. Ctrl/Cmd+Enter it lets through. The same id
// as the editors' entry, so "?" lists one "Save".
let editorsOpen = 0;
let removeCatchAll: (() => void) | null = null;
function holdSaveKey(): () => void {
  editorsOpen += 1;
  removeCatchAll ??= registerShortcut({
    id: "save-editor",
    keys: SAVE_KEYS,
    group: "editing",
    label: "shortcuts.save",
    handler: (event) => matches(event, "Mod+S"),
    allowInFields: true,
    allowInDialog: true,
  });
  return () => {
    editorsOpen -= 1;
    if (editorsOpen === 0) {
      removeCatchAll?.();
      removeCatchAll = null;
    }
  };
}

export interface UnsavedPrompt {
  open: boolean;
  hasDraft: boolean;
  keep: () => void;
  leave: () => void;
  discard: () => void;
}

export function useUnsavedGuard({
  dirty,
  hasDraft = false,
  onDiscard,
  onLeave,
  onSave,
  scope,
  inDialog = false,
}: UnsavedGuardOptions) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  });

  // The browser's "leave site?" prompt while there are unsaved changes.
  useEffect(() => (dirty ? markDirty() : undefined), [dirty]);

  // In-app navigation: the router's history asks the blocker, which waits for the answer (true = stay). Outside a
  // router (component tests) there is nothing to hold.
  const router = useRouter({ warn: false }) as AnyRouter | undefined;
  const history = router?.history as RouterHistory | undefined;
  const [held, setHeld] = useState<((stay: boolean) => void) | null>(null);
  useEffect(() => {
    if (!history) return undefined;
    return history.block({
      enableBeforeUnload: false,
      blockerFn: () => {
        if (!dirtyRef.current) return false;
        log.info("unsaved_navigation_held");
        return new Promise<boolean>((resolve) => {
          setHeld(() => resolve);
        });
      },
    });
  }, [history]);
  const [closing, setClosing] = useState<(() => void) | null>(null);

  /** Close a dialog editor, asking first when there are unsaved changes. */
  const requestClose = useCallback((close: () => void) => {
    if (!dirtyRef.current) {
      close();
      return;
    }
    log.info("unsaved_close_held");
    setClosing(() => close);
  }, []);

  const finish = useCallback(
    async (choice: "keep" | "leave" | "discard") => {
      const proceed =
        closing ??
        (held
          ? () => {
              held(false);
            }
          : null);
      setClosing(null);
      setHeld(null);
      if (choice === "keep") {
        held?.(true);
        return;
      }
      log.info("unsaved_left", { choice });
      if (choice === "discard") await onDiscard?.();
      else await onLeave?.();
      dirtyRef.current = false;
      proceed?.();
    },
    [closing, held, onDiscard, onLeave],
  );

  const saves = onSave !== undefined;
  useEffect(() => (saves ? holdSaveKey() : undefined), [saves]);
  useShortcut({
    id: "save-editor",
    keys: SAVE_KEYS,
    group: "editing",
    label: "shortcuts.save",
    handler: () => {
      // Several editors on one page: the one holding the focus saves.
      if (scope?.current && !scope.current.contains(document.activeElement)) return false;
      // Nothing to save: the key does nothing (and opens no "Save page as").
      if (dirtyRef.current) onSave?.();
      return true;
    },
    allowInFields: true,
    allowInDialog: inDialog,
    enabled: saves,
  });

  const leave = useCallback(async () => {
    await onLeave?.();
    dirtyRef.current = false;
    log.info("unsaved_left", { choice: "leave", asked: false });
  }, [onLeave]);

  const prompt: UnsavedPrompt = {
    open: closing !== null || held !== null,
    hasDraft,
    keep: () => void finish("keep"),
    leave: () => void finish("leave"),
    discard: () => void finish("discard"),
  };
  return { requestClose, prompt, leave };
}
