// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. PWA settings (FR-OFF-06, D-55), plain data shared by vite.config.ts
// and the tests. The service worker caches the app shell only — built JS, CSS, fonts, icons and index.html — and never
// an API answer: user data lives in the local database (HAAL-052, ADR-0009) and leaves the device on sign-out. Every
// app address opens from the cache without network, except the server's own paths.
import type { ManifestOptions } from "vite-plugin-pwa";

export const THEME_COLOR = "#0F766E";
export const BACKGROUND_COLOR = "#FFFFFF";

export const MANIFEST: Partial<ManifestOptions> = {
  id: "/",
  name: "Haalendar",
  short_name: "Haalendar",
  description: "Calendar, To-Do and Kanban — on your own server, also offline.",
  lang: "en",
  start_url: "/calendar",
  scope: "/",
  display: "standalone",
  theme_color: THEME_COLOR,
  background_color: BACKGROUND_COLOR,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  ],
  shortcuts: [
    { name: "Calendar", url: "/calendar", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    { name: "To-Do", url: "/todo", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    { name: "Kanban", url: "/kanban", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
  ],
};

/** Files precached as the app shell (source maps excluded). */
export const PRECACHE_GLOBS = ["**/*.{js,css,html,svg,png,ico,woff2,webmanifest}"];

/** Paths the service worker leaves to the network: the API, metrics and health endpoints. */
export const NETWORK_ONLY_PATHS: RegExp[] = [/^\/api\//, /^\/metrics/, /^\/health/];
