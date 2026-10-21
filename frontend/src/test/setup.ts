// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Vitest setup: jest-dom matchers, matchMedia stub (jsdom lacks it),
// cleanup and isolated storage between tests.
import "@testing-library/jest-dom/vitest";
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. jsdom has no IndexedDB (local drafts): an in-memory implementation,
// fresh for every test; open toasts are dismissed between tests.
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import Dexie from "dexie";
import { IDBFactory } from "fake-indexeddb";
import { toast } from "sonner";
import { afterEach, vi } from "vitest";

import { stopSync } from "@/sync";
import { closeLocalDbs } from "@/sync/db";

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
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. jsdom lacks ResizeObserver, used by Radix popovers (dropdown menu).
globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. jsdom lacks pointer capture, used by the toasts' swipe handling.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;
// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. jsdom has no object URLs (previews of images being uploaded).
URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => undefined;
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. jsdom lacks scrollIntoView (Settings scrolls to the section named
// by the user menu).
Element.prototype.scrollIntoView = () => undefined;

afterEach(() => {
  cleanup();
  toast.dismiss();
  // +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The sync engine stops and Dexie gets the fresh IndexedDB too.
  stopSync();
  closeLocalDbs();
  const factory = new IDBFactory();
  globalThis.indexedDB = factory;
  Dexie.dependencies.indexedDB = factory;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
