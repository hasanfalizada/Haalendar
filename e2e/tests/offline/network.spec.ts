// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Offline and sync in the browser (FR-OFF-01..03, D-54..D-57): the
// network goes away and comes back, the page is reloaded without network, the server stops answering.
import { expect, test, unique, Watch } from "../../fixtures";
import { ADMIN } from "../../users";
import { createEvent, eventRow, written } from "../legacy/calendar";

import { allSent, connection, expectNetworkFailures, expectServerAway, installed, otherDevice } from "./offline";

test("changes made without network wait on the device and sync when it is back", async ({
  page,
  context,
  watch,
  browser,
  baseURL,
}) => {
  expectNetworkFailures(watch);
  const day = "2027-05-03";
  const made = unique("Made offline");
  const kept = unique("Edited offline");
  const gone = unique("Deleted offline");
  await installed(page, `/calendar?date=${day}`);
  await createEvent(page, { title: kept });
  await createEvent(page, { title: gone });
  await allSent(page);

  await context.setOffline(true);
  await expect(connection(page)).toContainText("Offline");
  await createEvent(page, { title: made, notification: "Saved on this device" });
  await expect(eventRow(page, made)).toBeVisible();
  await eventRow(page, kept).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit event" });
  await editor.getByLabel("Location").fill("Cafe");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await eventRow(page, gone).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete event?" }).getByRole("button", { name: "Delete" }).click();
  await expect(eventRow(page, gone)).toBeHidden();
  await expect(eventRow(page, kept)).toContainText("Cafe");
  await expect(connection(page)).toContainText("3 changes wait on this device");

  await context.setOffline(false);
  await written(page, "3 changes synced.");
  await expect(connection(page)).toHaveText("Connected");

  const phone = await otherDevice(browser, baseURL ?? "");
  try {
    await phone.page.goto(`/calendar?date=${day}`);
    await expect(eventRow(phone.page, made)).toBeVisible();
    await expect(eventRow(phone.page, kept)).toContainText("Cafe");
    await expect(eventRow(phone.page, gone)).toBeHidden();
  } finally {
    await phone.close();
  }
});

test("without network the app opens from the device after a reload, with its data and the waiting changes", async ({
  page,
  context,
  watch,
}) => {
  expectNetworkFailures(watch);
  const day = "2027-05-04";
  const before = unique("Synced before");
  const made = unique("Made offline");
  await installed(page, `/calendar?date=${day}`);
  await createEvent(page, { title: before });
  await allSent(page);

  await context.setOffline(true);
  await createEvent(page, { title: made, notification: "Saved on this device" });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: May 4, 2027");
  await expect(page.getByText(/^You are offline\./)).toBeVisible();
  await expect(eventRow(page, before)).toBeVisible();
  await expect(eventRow(page, made)).toBeVisible();
  await expect(connection(page)).toContainText("1 change waits on this device");
  // Other screens open from the device as well.
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "To-Do" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("To-Do");

  await context.setOffline(false);
  await written(page, "1 change synced.");
  await expect(connection(page)).toHaveText("Connected");
});

test("a server that does not answer is named as such; changes wait and sync once it is back", async ({
  page,
  watch,
}) => {
  expectServerAway(watch);
  const title = unique("Server away");
  await installed(page, "/calendar?date=2027-05-05");
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 503, contentType: "text/plain", body: "Service Unavailable" }),
  );
  // The app notices at its next request; the reload asks for the profile right away.
  await page.reload();
  await expect(page.getByText(/^The server cannot be reached\./)).toBeVisible();
  await expect(connection(page)).toContainText("Server unreachable");
  await createEvent(page, { title, notification: "Saved on this device" });
  await expect(eventRow(page, title)).toBeVisible();
  await expect(connection(page)).toHaveText("Server unreachable — 1 change waits on this device");

  await page.unroute("**/api/v1/**");
  await written(page, "1 change synced.");
  await expect(connection(page)).toHaveText("Connected");
  await expect(page.getByText(/^The server cannot be reached\./)).toBeHidden();
});

test("a change the server applied but whose answer was lost is applied once", async ({
  page,
  watch,
  browser,
  baseURL,
}) => {
  watch.allow(/Failed to load resource: net::ERR_FAILED/);
  watch.allow(/\[haalendar\] (sync_failed|sync_counts_failed)/);
  const day = "2027-05-06";
  const title = unique("Exactly once");
  await installed(page, `/calendar?date=${day}`);
  let lost = 0;
  await page.route("**/api/v1/sync/push", async (route) => {
    if (lost > 0) return route.continue();
    lost += 1;
    await route.fetch(); // the server applies the change …
    await route.abort("failed"); // … and the answer never arrives
  });
  await createEvent(page, { title });
  // The app sends it again; the server knows the change (idempotency key) and does not apply it twice.
  await expect.poll(() => lost).toBe(1);
  await expect(connection(page)).toHaveText("Connected", { timeout: 20_000 });

  const phone = await otherDevice(browser, baseURL ?? "");
  try {
    await phone.page.goto(`/calendar?date=${day}`);
    await expect(eventRow(phone.page, title)).toHaveCount(1);
    await phone.page.reload();
    await expect(eventRow(phone.page, title)).toHaveCount(1);
  } finally {
    await phone.close();
  }
  await expect(eventRow(page, title)).toHaveCount(1);
});

test("two tabs share the device: a change in one shows in the other, also offline, and is sent once", async ({
  page,
  context,
  watch,
  browser,
  baseURL,
}) => {
  expectNetworkFailures(watch);
  const day = "2027-05-07";
  const title = unique("Second tab");
  await installed(page, `/calendar?date=${day}`);
  const tab = await context.newPage();
  const tabWatch = new Watch(tab);
  expectNetworkFailures(tabWatch);
  await tab.goto(`/calendar?date=${day}`);
  await expect(connection(tab)).toHaveText("Connected");

  await context.setOffline(true);
  await createEvent(tab, { title, notification: "Saved on this device" });
  await expect(eventRow(page, title)).toBeVisible();
  await expect(connection(page)).toContainText("1 change waits on this device");

  await context.setOffline(false);
  await expect(connection(page)).toHaveText("Connected", { timeout: 20_000 });
  await expect(connection(tab)).toHaveText("Connected");
  await tab.close();
  expect(tabWatch.unexpected(), "the second tab's console and API answers").toEqual([]);

  const phone = await otherDevice(browser, baseURL ?? "");
  try {
    await phone.page.goto(`/calendar?date=${day}`);
    await expect(eventRow(phone.page, title)).toHaveCount(1);
  } finally {
    await phone.close();
  }
});

test("signing out with unsent changes asks first and then removes the device's data", async ({ browser, baseURL }) => {
  // A session of its own: signing out ends it on the server, the shared one stays.
  // (@playwright/test hands new contexts the project's options: the stored session is cleared explicitly.)
  const context = await browser.newContext({
    baseURL,
    locale: "en-US",
    timezoneId: "Europe/Berlin",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const watch = new Watch(page);
  expectNetworkFailures(watch);
  watch.allow(/^401 GET \/api\/v1\/me$/);
  watch.allow(/api_request_failed .*status: 401, method: GET/);
  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await installed(page, "/calendar?date=2027-05-10");
    const title = unique("Never sent");
    await context.setOffline(true);
    await createEvent(page, { title, notification: "Saved on this device" });

    const signOut = async () => {
      await page.getByRole("button", { name: /^Account menu of / }).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
    };
    await signOut();
    const ask = page.getByRole("dialog", { name: "Sign out and lose unsent changes?" });
    await expect(ask).toContainText("1 change has not reached the server yet (no connection).");
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(eventRow(page, title)).toBeVisible();

    await signOut();
    await ask.getByRole("button", { name: "Sign out anyway" }).click();
    await expect(page).toHaveURL(/\/login/);
    const left = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
    // The user's local database (haalendar-<user id>) with the unsent change is gone.
    expect(left.filter((name) => /^haalendar-[0-9a-f]{8}-/.test(name ?? ""))).toEqual([]);
  } finally {
    await context.close();
  }
  expect(watch.unexpected(), "browser console and API answers").toEqual([]);
});
