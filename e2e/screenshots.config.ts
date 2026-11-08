// +++===+++ 2026-11-08 — Hasan Alizada — HAAL-152. The README's screenshots: scripts/dev/screenshots.sh runs this on the
// throw-away stack with made-up data. Not part of the end-to-end tests.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./screenshots",
  globalSetup: "./global-setup.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/screenshots",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    storageState: ".auth/admin.json",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1280, height: 800 },
  },
});
