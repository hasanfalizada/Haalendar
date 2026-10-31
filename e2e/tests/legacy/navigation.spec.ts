// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Legacy regression, navigation and date (F-01..F-06,
// docs/requirements/legacy-feature-inventory.md; FR-CAL-02..05, D-62, D-63). "Today" is fixed in the browser.
import { expect, test } from "../../fixtures";

import { fixToday, TODAY } from "./calendar";

test.beforeEach(async ({ page }) => {
  await fixToday(page);
});

test("F-01 the month in the sidebar selects a day, weeks start on Monday", async ({ page }) => {
  await page.goto("/calendar");
  const month = page.getByRole("grid", { name: "November 2026" });
  await expect(month.getByRole("columnheader").nth(1)).toHaveText("M");
  await expect(month.getByRole("gridcell", { name: "Wednesday, November 4, 2026, today" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await month.getByRole("button", { name: /^Friday, November 13, 2026/ }).click();
  await expect(page).toHaveURL(/date=2026-11-13/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: November 13, 2026");
  await page.getByRole("button", { name: "Next month" }).click();
  await page
    .getByRole("grid", { name: "December 2026" })
    .getByRole("button", { name: /^Monday, December 7, 2026/ })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: December 7, 2026");
});

test("F-02 previous and next day, with the buttons and the arrow keys", async ({ page }) => {
  await page.goto("/calendar?date=2026-11-30");
  const heading = page.getByRole("heading", { level: 1 });
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(heading).toHaveText("Calendar: December 1, 2026");
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(heading).toHaveText("Calendar: November 29, 2026");
  await page.locator("body").press("ArrowRight");
  await expect(heading).toHaveText("Calendar: November 30, 2026");
  await page.locator("body").press("ArrowLeft");
  await expect(heading).toHaveText("Calendar: November 29, 2026");
  await expect(page).toHaveURL(/date=2026-11-29/);
});

test("F-03 Today jumps back to today, with the button and the T key", async ({ page }) => {
  await page.goto("/calendar?date=2027-03-15");
  const today = page.getByRole("button", { name: "Today", exact: true });
  await today.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: Today");
  await expect(page).toHaveURL(new RegExp(`date=${TODAY}|/calendar$`));
  await expect(today).toBeDisabled();
  await page.goto("/calendar?date=2025-01-02");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: January 2, 2025");
  await page.locator("body").press("t");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: Today");
});

test("F-04 the sidebar folds away and comes back", async ({ page }) => {
  await page.goto("/calendar");
  const sidebar = page.getByRole("complementary", { name: "Calendar sidebar" });
  await expect(sidebar).toBeVisible();
  await page.getByRole("button", { name: "Hide the sidebar" }).click();
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Show the sidebar" }).click();
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide the sidebar" })).toHaveAttribute("aria-expanded", "true");
});

test("F-05 the header shows the date, a live clock and the ISO week of the selected date", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: Today");
  const clock = page.getByRole("timer", { name: "Current time" });
  await expect(clock).toHaveText(/^10:00:\d\d$/);
  const shown = await clock.textContent();
  await page.clock.runFor(2000);
  await expect(clock).not.toHaveText(shown ?? "");
  await expect(page.getByText("Week 45", { exact: true }).and(page.getByTitle("ISO week 45 of 2026"))).toHaveText(
    "Week 45",
  );

  // The week of the selected day, not of today (legacy defect 6); 1 January 2027 is in week 53 of 2026.
  await page.goto("/calendar?date=2027-01-01");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar: January 1, 2027");
  await expect(page.getByRole("main").getByText("Friday", { exact: true })).toBeVisible();
  await expect(page.getByText("Week 53 · 2026", { exact: true })).toHaveAttribute("title", "ISO week 53 of 2026");
});

test.fixme("F-06 typing YYYY-MM-DD in the search and Enter opens that day (HAAL-039, postponed)", async () => {});
