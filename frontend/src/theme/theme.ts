// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Theme preference (system / light / dark, FR-X-16).
// The resolved theme is written to <html data-theme>; Tailwind's dark variant and the CSS tokens key off it.
// Storage access is wrapped: private windows and blocked storage must never break the app.
import { log } from "@/lib/log";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "haalendar.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readPreference(storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage()): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch (error) {
    log.warn("theme_storage_read_failed", { error: String(error) });
    return "system";
  }
}

export function writePreference(
  preference: ThemePreference,
  storage: Pick<Storage, "setItem"> | undefined = safeLocalStorage(),
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    log.warn("theme_storage_write_failed", { error: String(error) });
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean = systemPrefersDark()): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function applyTheme(resolved: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = resolved;
  log.debug("theme_applied", { resolved });
}

/** Calls `onChange` whenever the OS color scheme changes; returns an unsubscribe function. */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(DARK_QUERY);
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches);
  };
  media.addEventListener("change", listener);
  return () => {
    media.removeEventListener("change", listener);
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
