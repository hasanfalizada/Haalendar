// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Starts the throw-away stack when no address is given, makes the
// first administrator through the setup wizard (or signs in when the instance is set up) and keeps the signed-in state
// for the tests. Returns the teardown that stops the stack it started.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type FullConfig } from "@playwright/test";

import { ADMIN } from "./users";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = resolve(here, "../scripts/dev");

export default async function globalSetup(config: FullConfig): Promise<() => void> {
  const own = !process.env.E2E_BASE_URL;
  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. With the production build for the offline project.
  if (own) execFileSync(resolve(scripts, "stack-up.sh"), ["--preview"], { stdio: "inherit" });
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5173";
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL, locale: "en-US", timezoneId: "Europe/Berlin" });
  const status = (await (await page.request.get("/api/v1/setup/status")).json()) as { setup_required: boolean };
  if (status.setup_required) {
    await page.goto("/setup");
    await page.getByLabel("Your name").fill(ADMIN.name);
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Create administrator" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/setup"));
  } else {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  mkdirSync(resolve(here, ".auth"), { recursive: true });
  await page.context().storageState({ path: resolve(here, ".auth/admin.json") });
  await browser.close();
  return () => {
    if (own) execFileSync(resolve(scripts, "stack-down.sh"), { stdio: "inherit" });
  };
}
