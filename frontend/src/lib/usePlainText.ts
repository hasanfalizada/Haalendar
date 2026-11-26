// +++===+++ 2026-11-26 19:10 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). The text of a Markdown source for a one-line
// preview, with the Markdown parser loaded the first time one is needed (a chunk of its own, as the renderer, D-51), so
// the calendar does not load it with its first screen. Until it is there, the source as it was written stands in.
import { useEffect, useState } from "react";

import type { toPlainText } from "./markdown-text";

let loaded: typeof toPlainText | null = null;
let loading: Promise<unknown> | null = null;

function load(): Promise<unknown> {
  loading ??= import("./markdown-text").then(
    (module) => {
      loaded = module.toPlainText;
    },
    () => {
      // Not loaded (offline before it was ever fetched): the source stands in; the next preview tries again.
      loading = null;
    },
  );
  return loading;
}

export function usePlainText(source: string, options: { singleLine?: boolean } = {}): string {
  const [, setReady] = useState(loaded !== null);
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    void load().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return loaded ? loaded(source, options) : source;
}
