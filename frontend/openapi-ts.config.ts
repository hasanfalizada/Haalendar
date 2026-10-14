// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Generates the typed API client from the hand-written contract
// (ADR-0007: api/openapi.yaml is the source of truth). Output is generated on every dev/build/check and not committed.
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../api/openapi.yaml",
  output: { path: "src/api/generated" },
  plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
});
