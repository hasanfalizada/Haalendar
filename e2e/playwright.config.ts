// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. End-to-end tests of the whole app in Chromium (test strategy §2).
// Without E2E_BASE_URL the run starts the throw-away stack (scripts/dev/stack-up.sh) and stops it afterwards; with it,
// the tests run against that address (the first administrator is created there unless E2E_ADMIN_* signs in).
import { defineConfig, devices } from "@playwright/test";

const offlineURL = process.env.E2E_OFFLINE_URL ?? (process.env.E2E_BASE_URL ? undefined : "http://localhost:4173");

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // One stack, one database: tests that share the administrator run one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    storageState: ".auth/admin.json",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: "offline/**",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } },
    },
    // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Offline and sync scenarios on the production build with its
    // service worker (stack-up.sh --preview, port 4173; E2E_OFFLINE_URL for another stack). Without it — a stack given
    // by E2E_BASE_URL alone — the project is left out.
    ...(offlineURL
      ? [
          {
            name: "offline",
            testMatch: "offline/**/*.spec.ts",
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 1280, height: 860 },
              baseURL: offlineURL,
              serviceWorkers: "allow" as const,
            },
          },
        ]
      : []),
  ],
});
