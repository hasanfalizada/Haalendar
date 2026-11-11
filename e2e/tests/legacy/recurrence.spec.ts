// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Legacy regression, recurrence (F-20..F-23,
// docs/requirements/legacy-feature-inventory.md; FR-CAL-10..14, D-67). Every scenario has its own days and titles.
import { expect, test, unique } from "../../fixtures";

import { createEvent, eventRow, fixToday, written } from "./calendar";

async function shows(page: import("@playwright/test").Page, day: string, title: string, expected: boolean) {
  await page.goto(`/calendar?date=${day}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Calendar: /);
  if (expected) await expect(eventRow(page, title), `${title} on ${day}`).toBeVisible();
  else await expect(eventRow(page, title), `${title} not on ${day}`).toBeHidden();
}

async function openOccurrence(page: import("@playwright/test").Page, day: string, title: string) {
  await page.goto(`/calendar?date=${day}`);
  await eventRow(page, title).click();
  return page.getByRole("dialog", { name: "Event details" });
}

test("F-20 repeat daily, weekly, monthly and yearly, without an end; a series has no To date", async ({ page }) => {
  await page.goto("/calendar?date=2027-01-31");
  await page.getByRole("button", { name: "New event" }).first().click();
  const editor = page.getByRole("dialog", { name: "New event" });
  const repeats = await editor.getByLabel("Repeat").locator("option").allTextContents();
  expect(repeats).toEqual(
    expect.arrayContaining([
      "Does not repeat",
      "Every day",
      "Every week on Sunday",
      "Every month on day 31",
      "Every year on January 31",
    ]),
  );
  await expect(editor.getByRole("textbox", { name: "To" })).toBeVisible();
  await editor.getByLabel("Repeat").selectOption({ label: "Every day" });
  await expect(editor.getByRole("textbox", { name: "To" })).toBeHidden();
  await editor.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(editor).toBeHidden();

  const daily = unique("Daily");
  const weekly = unique("Weekly");
  const monthly = unique("Monthly");
  const yearly = unique("Yearly");
  await createEvent(page, { title: daily, repeat: "Every day" });
  await createEvent(page, { title: weekly, repeat: "Every week on Sunday" });
  await createEvent(page, { title: monthly, repeat: "Every month on day 31" });
  await createEvent(page, { title: yearly, repeat: "Every year on January 31" });
  await expect(eventRow(page, daily)).toContainText("repeats");

  await shows(page, "2027-01-30", daily, false); // nothing before the start
  await shows(page, "2027-02-01", daily, true);
  await shows(page, "2029-06-15", daily, true); // no end date
  await shows(page, "2027-02-01", weekly, false);
  await shows(page, "2027-02-07", weekly, true);
  await shows(page, "2027-02-28", monthly, false); // February has no 31st: skipped
  await shows(page, "2027-03-31", monthly, true);
  await shows(page, "2027-03-31", yearly, false);
  await shows(page, "2028-01-31", yearly, true);
});

test("F-21 delete only this occurrence, or all occurrences", async ({ page }) => {
  const title = unique("Standup");
  await createEvent(page, { date: "2027-02-01", title, repeat: "Every day" });

  await (await openOccurrence(page, "2027-02-03", title)).getByRole("button", { name: "Delete" }).click();
  const ask = page.getByRole("dialog", { name: "Delete repeating event?" });
  await expect(ask).toContainText("Wednesday, February 3, 2027");
  await ask.getByRole("button", { name: "Only this occurrence" }).click();
  await expect(eventRow(page, title)).toBeHidden();
  await written(page, `Deleted ${title} on`);
  await shows(page, "2027-02-03", title, false);
  await shows(page, "2027-02-02", title, true);
  await shows(page, "2027-02-04", title, true);

  await (await openOccurrence(page, "2027-02-05", title)).getByRole("button", { name: "Delete" }).click();
  await ask.getByRole("button", { name: "All occurrences" }).click();
  await expect(eventRow(page, title)).toBeHidden();
  await written(page, `Deleted ${title}`);
  await shows(page, "2027-02-01", title, false);
  await shows(page, "2027-02-10", title, false);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trash" }).click();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: title })).toBeVisible();
});

test("F-22 edit only this occurrence: it becomes its own event; Cancel changes nothing", async ({ page }) => {
  const title = unique("Lesson");
  const moved = unique("Lesson moved");
  await createEvent(page, { date: "2027-03-01", title, repeat: "Every week on Monday", location: "Room A" });

  // Cancel leaves the series untouched (legacy saved the copy on Cancel — intentionally changed).
  await (await openOccurrence(page, "2027-03-08", title)).getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("dialog", { name: "Edit repeating event?" })
    .getByRole("button", { name: "Only this occurrence" })
    .click();
  let editor = page.getByRole("dialog", { name: "Edit the occurrence on Monday, March 8, 2027" });
  await expect(editor.getByLabel("Title")).toHaveValue(title);
  await expect(editor.getByLabel("Location")).toHaveValue("Room A");
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toBeHidden();
  await shows(page, "2027-03-08", title, true);

  await (await openOccurrence(page, "2027-03-08", title)).getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("dialog", { name: "Edit repeating event?" })
    .getByRole("button", { name: "Only this occurrence" })
    .click();
  editor = page.getByRole("dialog", { name: "Edit the occurrence on Monday, March 8, 2027" });
  await editor.getByLabel("Title").fill(moved);
  await editor.getByLabel("Location").fill("Room B");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await written(page, `Saved ${moved} as a separate event`);

  await shows(page, "2027-03-08", title, false);
  await shows(page, "2027-03-08", moved, true);
  await expect(eventRow(page, moved)).toContainText("Room B");
  await expect(eventRow(page, moved)).not.toContainText("repeats");
  await shows(page, "2027-03-01", title, true);
  await shows(page, "2027-03-15", title, true);
  await shows(page, "2027-03-15", moved, false);
});

test("F-23 a series whose first occurrences are deleted starts at the first one left", async ({ page }) => {
  // Seen through the overdue counter (F-32, D-68): a series counts once its effective start is before today.
  await fixToday(page); // Wednesday, 4 November 2026
  const title = unique("Early series");
  await page.goto("/calendar?date=2026-11-02");
  const counter = page.getByRole("complementary", { name: "Calendar sidebar" }).getByText(/overdue event/);
  await createEvent(page, { title, repeat: "Every day" });
  // Other scenarios may have left events before today: the series adds one to whatever the counter shows.
  await expect(counter).toBeVisible();
  const counted = await overdue(counter);

  for (const day of ["2026-11-02", "2026-11-03"]) {
    await (await openOccurrence(page, day, title)).getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete repeating event?" })
      .getByRole("button", { name: "Only this occurrence" })
      .click();
    await expect(eventRow(page, title)).toBeHidden();
    await written(page, `Deleted ${title} on`);
  }
  // The series now begins today, 4 November: no longer overdue.
  await shows(page, "2026-11-04", title, true);
  await expect.poll(() => overdue(counter)).toBe(counted - 1);
});

/** The number the overdue counter shows (0 when it is hidden). */
async function overdue(counter: import("@playwright/test").Locator): Promise<number> {
  if ((await counter.count()) === 0) return 0;
  return Number((await counter.textContent())?.match(/\d+/)?.[0] ?? 0);
}
