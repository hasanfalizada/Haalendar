// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. Unsaved-changes guard for an editor (FR-X-09, D-43). While `dirty`:
// - leaving the page inside the app (link, module switch Alt+1..3, browser back) is held by the router's blocker and
//   asks first;
// - closing a dialog editor (Esc, backdrop, close button, Cancel) goes through requestClose(), which asks first;
// - closing or reloading the tab triggers the browser's own prompt (api/write.ts tab-close guard).
// Answers: keep editing (default), leave (only for editors with a local draft: the draft stays and is offered next
// time) or discard the changes. Without changes nothing is asked. Ctrl/Cmd+Enter saves (`onSave`), listed in "?".
import { type AnyRouter, type RouterHistory, useRouter } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

import { log } from "./log";
import { useShortcut } from "./shortcuts";
import { markDirty } from "./unsaved";

interface UnsavedGuardOptions {
  dirty: boolean;
  /** The editor keeps a local draft (useDraft): offer "Leave" besides "Discard". */
  hasDraft?: boolean;
  /** Called on "Discard changes" before leaving (e.g. delete the draft, reset the fields). */
  onDiscard?: () => void | Promise<void>;
  /** Called on "Leave" before leaving (e.g. write the draft at once). */
  onLeave?: () => void | Promise<void>;
  /** Ctrl/Cmd+Enter saves the editor (while it has changes and the focus is inside `scope`). */
  onSave?: () => void;
  scope?: RefObject<HTMLElement | null>;
  /** The editor is a dialog: Ctrl/Cmd+Enter works inside it. */
  inDialog?: boolean;
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

  useShortcut({
    id: "save-editor",
    keys: ["Mod+Enter"],
    group: "editing",
    label: "shortcuts.save",
    handler: () => {
      // Several editors on one page: the one holding the focus saves.
      if (scope?.current && !scope.current.contains(document.activeElement)) return false;
      onSave?.();
      return true;
    },
    allowInFields: true,
    allowInDialog: inDialog,
    enabled: onSave !== undefined && dirty,
  });

  const prompt: UnsavedPrompt = {
    open: closing !== null || held !== null,
    hasDraft,
    keep: () => void finish("keep"),
    leave: () => void finish("leave"),
    discard: () => void finish("discard"),
  };
  return { requestClose, prompt };
}
