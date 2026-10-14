/// <reference types="vitest/config" />
// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Vite config: TanStack file-based routing (code-split), React, Tailwind v4.
// /api is proxied to the backend (default) or to the Prism mock: VITE_API_TARGET=http://localhost:4010 pnpm dev
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = (env.VITE_API_TARGET as string | undefined) ?? "http://localhost:8080";
  // Prism serves the contract without the /api/v1 prefix; the backend serves it with the prefix.
  const isMock = apiTarget.includes(":4010");

  return {
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
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
      css: false,
    },
  };
});
