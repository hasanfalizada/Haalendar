// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Starts the throw-away stack when no address is given, makes the
// first administrator through the setup wizard (or signs in when the instance is set up) and keeps the signed-in state
// for the tests. Returns the teardown that stops the stack it started.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type FullConfig, type Page } from "@playwright/test";

import { ADMIN } from "./users";

const here = dirname(fileURLToPath(import.meta.url));
const FIRST_PAGE_MS = 120_000;
const scripts = resolve(here, "../scripts/dev");

export default async function globalSetup(config: FullConfig): Promise<() => void> {
  const own = !process.env.E2E_BASE_URL;
  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. With the production build for the offline project.
  if (own) execFileSync(resolve(scripts, "stack-up.sh"), ["--preview"], { stdio: "inherit" });
  const stop = () => {
    if (own) execFileSync(resolve(scripts, "stack-down.sh"), { stdio: "inherit" });
  };
  // +++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. Playwright runs no teardown when the setup fails: stop the stack here.
  try {
    await signIn(config);
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

async function signIn(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5173";
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL, locale: "en-US", timezoneId: "Europe/Berlin" });
  // +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. A failed setup leaves what the browser saw for the CI artifact (Playwright
  // writes no report for it), and the first page of a cold dev server may take long: the first field may wait 2 minutes.
  const failure = resolve(here, "../.dev");
  mkdirSync(failure, { recursive: true });
  page.on("console", (message) => {
    appendFileSync(resolve(failure, "e2e-setup-console.log"), `${message.type()}: ${message.text()}\n`);
  });
  page.on("requestfailed", (request) => {
    appendFileSync(
      resolve(failure, "e2e-setup-console.log"),
      `failed: ${request.url()} ${request.failure()?.errorText}\n`,
    );
  });
  try {
    await signInOn(page);
  } catch (error) {
    await page.screenshot({ path: resolve(failure, "e2e-setup-failure.png"), fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    await browser.close();
  }
}

async function signInOn(page: Page): Promise<void> {
  const status = (await (await page.request.get("/api/v1/setup/status")).json()) as {
    setup_required: boolean;
    setup_token_required: boolean;
  };
  if (status.setup_required) {
    await page.goto("/setup");
    // +++===+++ 2026-11-01 — Hasan Alizada — HAAL-150. A production instance asks for its setup token (E2E_SETUP_TOKEN).
    if (status.setup_token_required) {
      const token = process.env.E2E_SETUP_TOKEN;
      if (!token) throw new Error("The instance asks for a setup token: set E2E_SETUP_TOKEN");
      await page.getByLabel("Setup token").fill(token);
    }
    await page.getByLabel("Your name").fill(ADMIN.name, { timeout: FIRST_PAGE_MS });
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Create administrator" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/setup"));
  } else {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email, { timeout: FIRST_PAGE_MS });
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
  mkdirSync(resolve(here, ".auth"), { recursive: true });
  await page.context().storageState({ path: resolve(here, ".auth/admin.json") });
}
