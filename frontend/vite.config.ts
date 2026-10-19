/// <reference types="vitest/config" />
// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Vite config: TanStack file-based routing (code-split), React, Tailwind v4.
// /api is proxied to the backend (default) or to the Prism mock: VITE_API_TARGET=http://localhost:4010 pnpm dev
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

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
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: mode !== "test" }), react(), tailwindcss()],
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
