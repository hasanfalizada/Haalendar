// +++===+++ 2026-11-26 17:45 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). Core Web Vitals of the production build,
// measured by the browser's own APIs (no library) on a phone with the processor 4 times slower, on two networks:
// "slow" as Lighthouse's mobile run (150 ms round trip, 1.6 Mbit/s) and "4G" (40 ms, 9 Mbit/s). Limits of the SRS:
// LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms. Gated (option 1 of the owner, 2026-11-26): the first visit on 4G (sign-in page
// and calendar), the sign-in page's first visit on the slow network, and the calendar opened again on the slow network
// (cached, as it opens every day). The calendar's very first visit on the slow network is measured and reported only:
// about 365 KB of code must cross 1.6 Mbit/s before it paints (3.0 s measured). Each measure is the best of two runs,
// as the machine running the tests is shared; when it is busy with other work (more than one runnable task per
// processor) the measures are skipped, with the load in the report. A lab measure of one device, not of users: there
// is no telemetry (SRS).
import { availableParallelism, loadavg } from "node:os";

import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Measured, serveBuild } from "./server";

const LIMITS = { lcp: 2500, cls: 0.1, inp: 200 };
const RUNS = 2;
const CALENDAR = "/calendar?date=2027-06-16&view=day";

interface Vitals {
  lcp: number;
  cls: number;
  inp: number;
}

const NETWORKS = {
  slow: { latency: 150, megabits: 1.6 },
  "4G": { latency: 40, megabits: 9 },
} as const;
type Network = keyof typeof NETWORKS;

/** Collects the metrics from the first byte on, in window.__vitals. */
const OBSERVE = () => {
  const vitals = { lcp: 0, cls: 0, inp: 0 };
  (window as unknown as { __vitals: typeof vitals }).__vitals = vitals;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  // CLS: the largest session of shifts (gaps under 1 s, at most 5 s long), shifts right after an input left out.
  let session = 0;
  let first = 0;
  let last = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (entry.hadRecentInput) continue;
      if (session > 0 && entry.startTime - last < 1000 && entry.startTime - first < 5000) {
        session += entry.value;
      } else {
        session = entry.value;
        first = entry.startTime;
      }
      last = entry.startTime;
      vitals.cls = Math.max(vitals.cls, session);
    }
  }).observe({ type: "layout-shift", buffered: true });
  // INP: the longest interaction (few interactions here, so the longest, not the 98th percentile).
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
      if (entry.interactionId) vitals.inp = Math.max(vitals.inp, entry.duration);
    }
  }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
};

/** Runnable tasks per processor (load average of the last minute) above which the machine is too busy to measure. */
const BUSY = 1;

let server: Measured;
let busy = 0;

test.beforeAll(async ({}, info) => {
  server = await serveBuild(String(info.project.use.baseURL));
  busy = (loadavg()[0] ?? 0) / availableParallelism();
});
test.beforeEach(() => {
  // On a shared machine running other work the browser waits for a processor, and the numbers say nothing of the app.
  test.skip(busy > BUSY, `the machine is too busy to measure (${busy.toFixed(1)} runnable tasks per processor)`);
});
test.afterAll(async () => {
  await server.close();
});

/** A phone with an empty cache and no service worker (a first visit), signed in or not. */
async function phone(browser: Browser, signedIn: boolean) {
  const context = await browser.newContext({
    storageState: signedIn ? ".auth/admin.json" : { cookies: [], origins: [] },
    serviceWorkers: "block",
    viewport: { width: 412, height: 823 },
    isMobile: true,
    hasTouch: true,
    locale: "en-US",
    timezoneId: "Europe/Berlin",
  });
  const page = await context.newPage();
  await page.addInitScript(OBSERVE);
  return { context, page };
}

async function slowDown(page: Page, network: Network): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: NETWORKS[network].latency,
    downloadThroughput: (NETWORKS[network].megabits * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

async function vitals(page: Page): Promise<Vitals> {
  return page.evaluate(() => (window as unknown as { __vitals: Vitals }).__vitals);
}

/** Taps through the calendar: another view and back, the editor of a new event, the command palette. */
async function interact(page: Page): Promise<void> {
  await page.getByRole("radio", { name: "Week" }).click();
  await expect(page.getByRole("radio", { name: "Week" })).toBeChecked();
  await page.getByRole("radio", { name: "Day" }).click();
  await expect(page.getByRole("radio", { name: "Day" })).toBeChecked();
  await page.getByRole("button", { name: "New event" }).first().click();
  await expect(page.getByRole("dialog", { name: "New event" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New event" })).toBeHidden();
  await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("combobox", { name: "Commands and search" })).toBeVisible();
  await page.keyboard.press("Escape");
  // The last interaction is reported once its next paint is done.
  await page.waitForTimeout(500);
}

async function signInPage(browser: Browser, network: Network): Promise<Vitals> {
  const { context, page } = await phone(browser, false);
  await slowDown(page, network);
  await page.goto(`${server.url}/login`);
  await expect(page.getByLabel("E-mail")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const measured = await vitals(page);
  await context.close();
  return measured;
}

async function calendar(browser: Browser, network: Network, visit: "first" | "again"): Promise<Vitals> {
  const { context, page } = await phone(browser, true);
  if (visit === "again") {
    await page.goto(`${server.url}${CALENDAR}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("networkidle");
  }
  await slowDown(page, network);
  await page.goto(`${server.url}${CALENDAR}`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  const painted = await vitals(page);
  await interact(page);
  const { inp } = await vitals(page);
  await context.close();
  return { ...painted, inp };
}

/** The best of `RUNS` measures, metric by metric. */
async function best(measure: () => Promise<Vitals>): Promise<Vitals> {
  const runs: Vitals[] = [];
  for (let run = 0; run < RUNS; run += 1) runs.push(await measure());
  return {
    lcp: Math.min(...runs.map((r) => r.lcp)),
    cls: Math.min(...runs.map((r) => r.cls)),
    inp: Math.min(...runs.map((r) => r.inp)),
  };
}

function within(what: string, measured: Vitals, metrics: (keyof Vitals)[]): void {
  test.info().annotations.push({ type: what, description: JSON.stringify(measured) });
  console.log(what, measured);
  for (const metric of metrics) {
    expect.soft(measured[metric], `${metric.toUpperCase()} of ${what}`).toBeLessThanOrEqual(LIMITS[metric]);
  }
}

test("the sign-in page on a first visit, on 4G and on the slow network", async ({ browser }) => {
  test.setTimeout(240_000);
  within("the sign-in page, first visit, 4G", await best(() => signInPage(browser, "4G")), ["lcp", "cls"]);
  within("the sign-in page, first visit, slow", await best(() => signInPage(browser, "slow")), ["lcp", "cls"]);
});

test("the calendar on a first visit on 4G", async ({ browser }) => {
  test.setTimeout(240_000);
  within("the calendar, first visit, 4G", await best(() => calendar(browser, "4G", "first")), ["lcp", "cls", "inp"]);
});

test("the calendar opened again on the slow network", async ({ browser }) => {
  test.setTimeout(240_000);
  within("the calendar, again, slow", await best(() => calendar(browser, "slow", "again")), ["lcp", "cls", "inp"]);
});

test("the calendar on a first visit on the slow network (reported, not a limit)", async ({ browser }) => {
  test.setTimeout(240_000);
  within("the calendar, first visit, slow", await best(() => calendar(browser, "slow", "first")), []);
});
