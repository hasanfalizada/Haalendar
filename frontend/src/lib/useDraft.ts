// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Draft autosave for an editor (D-39). While the values differ from
// the saved version they are written to the device one second after the last keystroke and again when the tab is
// hidden or closed. On opening, a draft that differs from the saved version is offered for restore (DraftNotice).
// The draft is removed only by commit() — call it after the server has confirmed the save — or by discard().
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { meQuery } from "@/api/session";

import { type DraftFields, discardDraft, loadDraft, saveDraft } from "./drafts";

export const DRAFT_DELAY_MS = 1_000;

export interface PendingDraft<F extends DraftFields> {
  fields: F;
  savedAt: string;
}

interface UseDraftOptions<F extends DraftFields> {
  /** Stable name of the editor and record, e.g. "profile" or "event:<id>". */
  scope: string;
  /** Current values of the editor. */
  values: F;
  /** Values of the saved version; equal values mean "nothing to keep". */
  baseline: F;
  enabled?: boolean;
}

function same(a: DraftFields, b: DraftFields): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
}

export function useDraft<F extends DraftFields>({ scope, values, baseline, enabled = true }: UseDraftOptions<F>) {
  const { data: me } = useQuery(meQuery);
  const user = enabled ? (me?.id ?? null) : null;
  const [pending, setPending] = useState<PendingDraft<F> | null>(null);
  // Autosave waits until the stored draft has been read and, if offered, restored or discarded.
  const [ready, setReady] = useState(false);
  const latest = useRef({ values, baseline, user, scope, ready });
  useLayoutEffect(() => {
    latest.current = { values, baseline, user, scope, ready };
  });

  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadDraft(user, scope).then((draft) => {
      if (!active) return;
      if (draft && !same(draft.fields, latest.current.baseline)) {
        setPending({ fields: draft.fields as F, savedAt: draft.saved_at });
      } else {
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [user, scope]);

  const serialized = JSON.stringify(values);
  const dirty = !same(values, baseline);
  useEffect(() => {
    if (!user || !ready) return;
    const timer = setTimeout(() => {
      if (dirty) void saveDraft(user, scope, latest.current.values);
      else void discardDraft(user, scope);
    }, DRAFT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [user, scope, ready, dirty, serialized]);

  // Leaving the page (tab hidden, closed, reloaded) writes the latest values at once.
  useEffect(() => {
    const onHide = () => {
      const now = latest.current;
      if (now.user && now.ready && !same(now.values, now.baseline)) void saveDraft(now.user, now.scope, now.values);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** Write the current values at once, e.g. right before sending them. */
  const flush = useCallback(async () => {
    const now = latest.current;
    if (now.user && now.ready && !same(now.values, now.baseline)) await saveDraft(now.user, now.scope, now.values);
  }, []);

  /** Take the offered draft; the caller puts the returned values into the editor. */
  const restore = useCallback((): F | null => {
    const fields = pending?.fields ?? null;
    setPending(null);
    setReady(true);
    return fields;
  }, [pending]);

  const discard = useCallback(async () => {
    setPending(null);
    setReady(true);
    if (user) await discardDraft(user, scope);
  }, [user, scope]);

  /** The server confirmed the save: the draft is no longer needed. */
  const commit = useCallback(async () => {
    if (user) await discardDraft(user, scope);
  }, [user, scope]);

  return { pending, restore, discard, commit, flush };
}
