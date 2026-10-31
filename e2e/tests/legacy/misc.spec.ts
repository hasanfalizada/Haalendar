// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Legacy regression, search, trash and the rest (F-30..F-34,
// docs/requirements/legacy-feature-inventory.md; FR-X-03, FR-X-04, FR-X-15, FR-CAL-17, FR-CAL-21; D-49, D-68).
import { expect, test, unique } from "../../fixtures";

import { createEvent, eventRow, fixToday, written } from "./calendar";

async function deleteEvent(page: import("@playwright/test").Page, title: string) {
  await eventRow(page, title).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete event?" }).getByRole("button", { name: "Delete" }).click();
  await written(page, `Deleted ${title}`);
}

test.fixme("F-30 title autocomplete in the search jumps to the event's date (HAAL-039, postponed)", async () => {});

test("F-31 the trash lists deleted events, newest deletion first, and restores several at once", async ({ page }) => {
  const tag = unique("trash");
  const first = `First ${tag}`;
  const second = `Second ${tag}`;
  await createEvent(page, { date: "2027-04-06", title: first });
  await createEvent(page, { title: second });
  await deleteEvent(page, first);
  await deleteEvent(page, second);

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trash" }).click();
  const entries = page.getByRole("list", { name: "Trash" }).getByRole("listitem").filter({ hasText: tag });
  await expect(entries).toHaveCount(2);
  // Newest deletion first (legacy ordered by creation, defect 8).
  await expect(entries.nth(0)).toContainText(second);
  await expect(entries.nth(1)).toContainText(first);

  await page.getByRole("checkbox", { name: `Select ${first}` }).check();
  await page.getByRole("checkbox", { name: `Select ${second}` }).check();
  await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Restore selected" }).click();
  await written(page, "2 entries restored.");
  await expect(entries).toHaveCount(0);

  await page.goto("/calendar?date=2027-04-06");
  await expect(eventRow(page, first)).toBeVisible();
  await expect(eventRow(page, second)).toBeVisible();
});

test("F-32 the sidebar counts events that started before today", async ({ page }) => {
  await fixToday(page); // Wednesday, 4 November 2026
  const past = unique("Past");
  const today = unique("Today");
  const counter = page.getByRole("complementary", { name: "Calendar sidebar" }).getByText(/overdue event/);
  const count = async () =>
    (await counter.count()) === 0 ? 0 : Number((await counter.textContent())?.match(/\d+/)?.[0] ?? 0);

  await createEvent(page, { date: "2026-11-01", title: past });
  await expect(counter).toBeVisible();
  const counted = await count();
  await expect(counter).toHaveText(`${counted} overdue event${counted === 1 ? "" : "s"}`);

  // An event of today is not overdue.
  await createEvent(page, { date: "2026-11-04", title: today });
  await expect.poll(count).toBe(counted);

  await page.goto("/calendar?date=2026-11-01");
  await deleteEvent(page, past);
  await expect.poll(count).toBe(counted - 1);
});

test.fixme("F-33 the history of an event shows its audit records (HAAL-114; the audit log itself: backend tests)", async () => {});

test("F-34 About says the app is free and links the author and the repository; Help is there too", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: /^Account menu of / }).click();
  await page.getByRole("menuitem", { name: "About Haalendar" }).click();
  const about = page.getByRole("dialog", { name: "About Haalendar" });
  await expect(about).toContainText("Haalendar is free and open-source software. It has no usage restrictions.");
  await expect(about.getByRole("link", { name: /Author's website/ })).toHaveAttribute(
    "href",
    "https://hasanfalizada.github.io/",
  );
  await expect(about.getByRole("link", { name: /Source code on GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/hasanfalizada/Haalendar",
  );
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();

  await page.getByRole("button", { name: /^Account menu of / }).click();
  await page.getByRole("menuitem", { name: "Help" }).click();
  const help = page.getByRole("dialog", { name: "Help" });
  await expect(help.getByRole("link", { name: /Documentation/ })).toHaveAttribute(
    "href",
    "https://github.com/hasanfalizada/Haalendar/tree/master/docs",
  );
});
