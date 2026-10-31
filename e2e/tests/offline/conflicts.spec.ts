// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Edits on two devices at the same time (FR-OFF-04, ADR-0009 rules
// 2–4): this device changes an event without network while the other device changes or deletes it; when the network
// is back the server merges different fields, keeps both versions of the same field for the user to choose (Settings
// → Sync), offers to restore what was deleted elsewhere, and tells when a delete hit something changed elsewhere.
import type { BrowserContext, Page } from "@playwright/test";

import { expect, test, unique, type Watch } from "../../fixtures";
import { createEvent, eventRow, written } from "../legacy/calendar";

import { allSent, connection, expectNetworkFailures, installed, otherDevice } from "./offline";

interface Change {
  title?: string;
  location?: string;
}

/** Opens the event, changes it in the editor and waits until the editor is closed. */
async function editEvent(page: Page, title: string, change: Change): Promise<void> {
  await eventRow(page, title).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit event" });
  if (change.title !== undefined) await editor.getByLabel("Title").fill(change.title);
  if (change.location !== undefined) await editor.getByLabel("Location").fill(change.location);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
}

async function deleteEvent(page: Page, title: string): Promise<void> {
  await eventRow(page, title).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete event?" }).getByRole("button", { name: "Delete" }).click();
  await expect(eventRow(page, title)).toBeHidden();
}

/**
 * Both devices show the day with the given events; this device then goes offline, `here` changes it, `there` changes
 * the other device (online, sent), and the network comes back.
 */
async function apart(
  setup: { page: Page; context: BrowserContext; watch: Watch; phone: Page },
  day: string,
  titles: string[],
  here: () => Promise<void>,
  there: () => Promise<void>,
): Promise<void> {
  const { page, context, watch, phone } = setup;
  expectNetworkFailures(watch);
  // The app warns about a change the server did not apply as it was (the conflict the scenario makes).
  watch.allow(/\[haalendar\] sync_change_not_applied /);
  await installed(page, `/calendar?date=${day}`);
  for (const title of titles) await createEvent(page, { title });
  await allSent(page);
  await phone.goto(`/calendar?date=${day}`);
  for (const title of titles) await expect(eventRow(phone, title)).toBeVisible();

  await context.setOffline(true);
  await expect(connection(page)).toContainText("Offline");
  await here();
  await there();
  await allSent(phone);
  await context.setOffline(false);
}

test("the same field changed on both devices waits for a choice per field in Settings → Sync", async ({
  page,
  context,
  watch,
  browser,
  baseURL,
}) => {
  const day = "2027-05-11";
  const title = unique("Both changed");
  const mineTitle = unique("Title from here");
  const theirTitle = unique("Title from there");
  const device = await otherDevice(browser, baseURL ?? "");
  try {
    const phone = device.page;
    await apart(
      { page, context, watch, phone },
      day,
      [title],
      () => editEvent(page, title, { title: mineTitle, location: "Room here" }),
      () => editEvent(phone, title, { title: theirTitle, location: "Room there" }),
    );
    // Told in the notification center, which leads to Settings → Sync.
    await expect(connection(page)).toHaveText("1 sync conflict — resolve", { timeout: 20_000 });
    await page.getByRole("button", { name: /^Notifications, 1 unread/ }).click();
    await page.getByText("A change could not be applied as it was: someone changed the same fields.").click();
    await expect(page).toHaveURL(/\/settings#sync$/);
    const card = page.getByRole("region", { name: "Sync" }).getByRole("listitem", { name: `Item: ${theirTitle}` });
    await expect(card).toContainText("Changed here and on another device");
    // Every field is named as the editor names it.
    await expect(card.getByText("Title", { exact: true })).toBeVisible();
    await expect(card.getByText("Location", { exact: true })).toBeVisible();
    // Title: theirs, location: mine.
    await card.getByRole("radio", { name: new RegExp(`^Theirs \\(server\\) ${theirTitle}`) }).check();
    await card.getByRole("radio", { name: /^Mine \(this device\) Room here/ }).check();
    await card.getByRole("button", { name: "Apply my choice" }).click();
    await written(page, "Conflict resolved.");
    await expect(page.getByText("No conflicts — every change made on this device has been applied.")).toBeVisible();
    await allSent(page);

    await phone.reload();
    await expect(eventRow(phone, theirTitle)).toContainText("Room here");
    await page.goto(`/calendar?date=${day}`);
    await expect(eventRow(page, theirTitle)).toContainText("Room here");
    await expect(connection(page)).toHaveText("Connected");
  } finally {
    await device.close();
  }
});

test("different fields changed on both devices are merged without asking", async ({
  page,
  context,
  watch,
  browser,
  baseURL,
}) => {
  const day = "2027-05-12";
  const title = unique("Merged");
  const renamed = unique("Renamed there");
  const device = await otherDevice(browser, baseURL ?? "");
  try {
    const phone = device.page;
    await apart(
      { page, context, watch, phone },
      day,
      [title],
      () => editEvent(page, title, { location: "Garden" }),
      () => editEvent(phone, title, { title: renamed }),
    );
    await written(page, "1 change synced.");
    await expect(connection(page)).toHaveText("Connected");
    await expect(eventRow(page, renamed)).toContainText("Garden");
    await phone.reload();
    await expect(eventRow(phone, renamed)).toContainText("Garden");
  } finally {
    await device.close();
  }
});

test("an event changed here but deleted on the other device can be restored with the changes or let go", async ({
  page,
  context,
  watch,
  browser,
  baseURL,
}) => {
  const day = "2027-05-13";
  const restored = unique("Restore me");
  const dropped = unique("Let me go");
  const device = await otherDevice(browser, baseURL ?? "");
  try {
    const phone = device.page;
    await apart(
      { page, context, watch, phone },
      day,
      [restored, dropped],
      async () => {
        await editEvent(page, restored, { location: "Kept place" });
        await editEvent(page, dropped, { location: "Lost place" });
      },
      async () => {
        await deleteEvent(phone, restored);
        await deleteEvent(phone, dropped);
      },
    );
    await expect(connection(page)).toHaveText("2 sync conflicts — resolve", { timeout: 20_000 });
    await expect(eventRow(page, restored)).toBeHidden();
    await connection(page).click();
    const section = page.getByRole("region", { name: "Sync" });

    const back = section.getByRole("listitem", { name: `Item: ${restored}` });
    await expect(back).toContainText("Changed here, deleted on another device");
    await expect(back).toContainText("Kept place");
    await back.getByRole("button", { name: "Restore with my changes" }).click();
    await written(page, "Conflict resolved.");

    const gone = section.getByRole("listitem", { name: `Item: ${dropped}` });
    await gone.getByRole("button", { name: "Discard my changes" }).click();
    await page
      .getByRole("dialog", { name: "Discard your changes?" })
      .getByRole("button", { name: "Discard my changes" })
      .click();
    await expect(section.getByText("No conflicts — every change made on this device has been applied.")).toBeVisible();
    await allSent(page);

    await page.goto(`/calendar?date=${day}`);
    await expect(eventRow(page, restored)).toContainText("Kept place");
    await expect(eventRow(page, dropped)).toBeHidden();
    await phone.reload();
    await expect(eventRow(phone, restored)).toContainText("Kept place");
    await expect(eventRow(phone, dropped)).toBeHidden();
  } finally {
    await device.close();
  }
});

test("deleting an event that was changed on the other device tells so and points to the trash", async ({
  page,
  context,
  watch,
  browser,
  baseURL,
}) => {
  const day = "2027-05-14";
  const title = unique("Deleted here");
  const device = await otherDevice(browser, baseURL ?? "");
  try {
    const phone = device.page;
    await apart(
      { page, context, watch, phone },
      day,
      [title],
      () => deleteEvent(page, title),
      () => editEvent(phone, title, { location: "Changed there" }),
    );
    await written(page, "1 change synced.");
    await expect(connection(page)).toHaveText("Connected");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page
      .getByText("Something you deleted had been changed on another device. It is in the trash if you need it back.")
      .click();
    await expect(page).toHaveURL(/\/trash/);
    await expect(page.getByText(title)).toBeVisible();
    await phone.reload();
    await expect(eventRow(phone, title)).toBeHidden();
  } finally {
    await device.close();
  }
});
