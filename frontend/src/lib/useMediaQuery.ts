// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. Whether a media query matches, following changes (window resized,
// device rotated) — for layout that changes structure, not only styles (the calendar sidebar is inline on desktops,
// an overlay on tablets and a sheet on phones). Breakpoints follow the design system (md 768, lg 1024).
import { useCallback, useSyncExternalStore } from "react";

export const TABLET_UP = "(min-width: 768px)";
export const DESKTOP_UP = "(min-width: 1024px)";

function media(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}

export function useMediaQuery(query: string, fallback = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = media(query);
      if (!list) return () => undefined;
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => media(query)?.matches ?? fallback,
    () => fallback,
  );
}
