// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Whether the main pointer is coarse (a finger) — for behaviour that
// CSS cannot express (e.g. long press instead of hover, swipe hints in the module views). Sizes use the CSS variants
// (`pointer-coarse:` / `pointer-fine:md:`), not this hook (FR-X-17, D-53). Follows changes, e.g. a detached keyboard.
import { useSyncExternalStore } from "react";

export const COARSE_POINTER = "(pointer: coarse)";

function media(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COARSE_POINTER)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const list = media();
  if (!list) return () => undefined;
  list.addEventListener("change", onChange);
  return () => {
    list.removeEventListener("change", onChange);
  };
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  );
}
