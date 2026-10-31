// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Legacy regression, live refresh (F-18,
// docs/requirements/legacy-feature-inventory.md; FR-X-18, D-59). The legacy app polled every second; here a change on
// another device (a second browser context: its own local database, the same account) reaches the open day by itself.
import { expect, test, unique, Watch } from "../../fixtures";

import { createEvent, eventRow } from "./calendar";

test("F-18 a change made on another device shows up without reloading", async ({ page, browser }) => {
  const day = "2026-12-14";
  const title = unique("From the phone");
  await page.goto(`/calendar?date=${day}`);
  await expect(page.getByRole("status", { name: "Connected" })).toBeVisible();

  const other = await browser.newContext({
    storageState: ".auth/admin.json",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
  });
  const phone = await other.newPage();
  const watch = new Watch(phone);
  try {
    await createEvent(phone, { date: day, title });
    await expect(eventRow(page, title)).toBeVisible();

    await eventRow(phone, title).click();
    await phone.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Edit" }).click();
    const editor = phone.getByRole("dialog", { name: "Edit event" });
    await editor.getByLabel("Location").fill("Station");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toBeHidden();
    await expect(eventRow(page, title)).toContainText("Station");

    await eventRow(phone, title).click();
    await phone.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
    await phone.getByRole("dialog", { name: "Delete event?" }).getByRole("button", { name: "Delete" }).click();
    await expect(eventRow(page, title)).toBeHidden();
  } finally {
    await other.close();
  }
  expect(watch.unexpected(), "the other device's console and API answers").toEqual([]);
});
