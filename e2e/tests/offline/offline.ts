// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Steps the offline scenarios share: the app installed (service worker
// in control of the next load) and synced, a second device, and the lines a browser without network writes into the
// console, which the scenarios expect.
import { expect, type Browser, type Page } from "@playwright/test";

import type { Watch } from "../../fixtures";

/** Opens the app, waits until its service worker has the app shell and the first sync has run. */
export async function installed(page: Page, path = "/calendar"): Promise<void> {
  await page.goto(path);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(connection(page)).toHaveText("Connected");
}

/** The connection indicator in the navigation rail. */
export function connection(page: Page) {
  return page.getByRole("navigation", { name: "Main navigation" }).getByRole("status");
}

/** The app's own warnings about a server it cannot reach (logged on purpose, so they are expected here). */
const UNREACHABLE =
  /\[haalendar\] (sync_failed|stream_failed|stream_error|profile_unreachable|setup_status_unavailable|health_live_failed|live_closed) /;

/** Failed requests while the network is cut are expected: the browser and the app report them. */
export function expectNetworkFailures(watch: Watch): void {
  watch.allow(/Failed to load resource: net::ERR_INTERNET_DISCONNECTED/);
  watch.allow(UNREACHABLE);
}

/** A server answering 503 is expected: the answers, the browser's lines about them and the app's warnings. */
export function expectServerAway(watch: Watch): void {
  watch.allow(/^503 /);
  watch.allow(/status of 503/);
  watch.allow(UNREACHABLE);
  watch.allow(/\[haalendar\] api_request_failed .*status: 503/);
}

/** Waits until this device has sent every change (its outbox in the local database is empty). */
export async function allSent(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const names = (await indexedDB.databases())
            .map((db) => db.name ?? "")
            .filter((name) => name.startsWith("haalendar-"));
          let waiting = 0;
          for (const name of names) {
            waiting += await new Promise<number>((resolve, reject) => {
              const request = indexedDB.open(name);
              request.onerror = () => reject(request.error ?? new Error("open failed"));
              request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("outbox")) {
                  db.close();
                  resolve(0);
                  return;
                }
                const count = db.transaction("outbox").objectStore("outbox").count();
                count.onsuccess = () => {
                  db.close();
                  resolve(count.result);
                };
                count.onerror = () => reject(count.error ?? new Error("count failed"));
              };
            });
          }
          return waiting;
        }),
      { message: "changes still waiting on this device", timeout: 20_000 },
    )
    .toBe(0);
}

/** Another device of the same user: its own browser context, so its own local database. */
export async function otherDevice(
  browser: Browser,
  baseURL: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL,
    storageState: ".auth/admin.json",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}
