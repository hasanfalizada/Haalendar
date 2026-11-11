// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). The browser notifications of this device for the
// signed-in user (lib/push) as React state: the current state, and turning them on (from a click) or off.
// +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The public demo sends nothing: no offer to turn them on.
import { useCallback, useEffect, useState } from "react";

import { useIsDemo } from "@/api/demo";

import { type PushState, disablePush, enablePush, pushState } from "./push";

export function usePush(user: string | undefined): {
  state: PushState | null;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = useIsDemo();

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    void pushState(user).then((found) => {
      if (alive) setState(found);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const enable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setState(await enablePush(user));
    setBusy(false);
  }, [user]);

  const disable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    await disablePush(user, "user");
    setState(await pushState(user));
    setBusy(false);
  }, [user]);

  return { state: demo ? "unsupported" : state, busy, enable, disable };
}
