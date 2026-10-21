/// <reference types="vitest/config" />
// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Vite config: TanStack file-based routing (code-split), React, Tailwind v4.
// /api is proxied to the backend (default) or to the Prism mock: VITE_API_TARGET=http://localhost:4010 pnpm dev
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. PWA (D-55): manifest + generated service worker caching the app shell
// (src/pwa-config.ts); updates wait for the user (prompt); off in development. `vite preview` proxies /api as well,
// so a production build can be tried locally, also offline.
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { MANIFEST, NETWORK_ONLY_PATHS, PRECACHE_GLOBS } from "./src/pwa-config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = (env.VITE_API_TARGET as string | undefined) ?? "http://localhost:8080";
  // Prism serves the contract without the /api/v1 prefix; the backend serves it with the prefix.
  const isMock = apiTarget.includes(":4010");
  // +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. The app version shown in About comes from package.json.
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

  return {
    // +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Route code splitting is off under Vitest: tests then do not
    // depend on lazy chunk loading (slow on WSL /mnt file systems); production builds keep per-route chunks.
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: mode !== "test" }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false, // registered by src/lib/pwa.ts (workbox-window), only in production
        manifest: MANIFEST,
        includeAssets: ["favicon.ico", "apple-touch-icon.png"],
        workbox: {
          globPatterns: PRECACHE_GLOBS,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: NETWORK_ONLY_PATHS,
          cleanupOutdatedCaches: true,
          runtimeCaching: [],
        },
        devOptions: { enabled: false },
      }),
    ],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: 5173,
      proxy: {
        "/api/v1": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: isMock ? (path) => path.replace(/^\/api\/v1/, "") : undefined,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: { "/api/v1": { target: apiTarget, changeOrigin: true } },
    },
    build: { sourcemap: true, target: "es2023" },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // +++===+++ 2026-10-18 — Hasan Alizada — HAAL-042. CSS stays off in tests except styles.css, which the palette
      // contrast test reads as text (`?raw`) to check the colour tokens.
      css: { include: [/src\/styles\.css/] },
      // +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. At most 4 parallel workers: on WSL /mnt drives starting one
      // fork per core made late workers miss Vitest's fixed 60 s start timeout.
      maxWorkers: 4,
    },
  };
});
