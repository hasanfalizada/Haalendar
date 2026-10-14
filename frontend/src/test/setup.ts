// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Vitest setup: jest-dom matchers, matchMedia stub (jsdom lacks it),
// cleanup and isolated storage between tests.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

export function stubMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("dark") ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

stubMatchMedia(false);
// jsdom does not implement scrolling; the router's scroll restoration calls it on navigation.
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
