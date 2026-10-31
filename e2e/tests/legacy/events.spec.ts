// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Legacy regression, events (F-10..F-17, F-19,
// docs/requirements/legacy-feature-inventory.md; FR-CAL-01, FR-CAL-06..09, FR-CAL-15, FR-X-01, FR-X-13; D-61, D-64..D-66).
// Every scenario has its own day and titles, so the scenarios do not see each other's events.
import { expect, test, unique } from "../../fixtures";

import { createEvent, eventRow } from "./calendar";

test("F-10 an event with every legacy field; an empty title saves as (No title)", async ({ page }) => {
  const title = unique("Board meeting");
  await createEvent(page, {
    date: "2026-12-01",
    title,
    start: "14:15",
    end: "15:45",
    location: "Room 4",
    description: "Agenda:\nbudget\nplan",
    color: "Green",
  });
  const row = eventRow(page, title);
  await expect(row).toContainText("14:15");
  await expect(row).toContainText("Room 4");
  await row.click();
  const details = page.getByRole("dialog", { name: "Event details" });
  await expect(details.getByRole("heading", { name: title })).toBeVisible();
  await expect(details).toContainText("14:15");
  await expect(details).toContainText("15:45");
  await expect(details).toContainText("Room 4");
  await expect(details.getByRole("radio", { name: "Green" })).toBeChecked();
  await page.keyboard.press("Escape");

  // Defaults: all day on, brown, titles up to 150 characters, times in quarter hours.
  await page.getByRole("button", { name: "New event" }).first().click();
  const editor = page.getByRole("dialog", { name: "New event" });
  await expect(editor.getByRole("checkbox", { name: "All day" })).toBeChecked();
  await expect(editor.getByRole("radio", { name: "Brown" })).toBeChecked();
  await expect(editor.getByLabel("Title")).toHaveAttribute("maxlength", "150");
  await editor.getByLabel("Title").fill("x".repeat(160));
  await expect(editor.getByLabel("Title")).toHaveValue("x".repeat(150));
  await expect(editor.getByText("150 / 150")).toBeVisible();
  await editor.getByLabel("Title").fill("");
  await editor.getByRole("checkbox", { name: "All day" }).uncheck();
  const times = await editor.getByLabel("Start time").locator("option").allTextContents();
  expect(times).toHaveLength(96);
  expect(times.slice(0, 3)).toEqual(["00:00", "00:15", "00:30"]);
  await editor.getByRole("checkbox", { name: "All day" }).check();
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(eventRow(page, "(No title)")).toBeVisible();
});

test("F-11 the end cannot be before the start; moving the start moves the end along", async ({ page }) => {
  await page.goto("/calendar?date=2026-12-02");
  await page.getByRole("button", { name: "New event" }).first().click();
  const editor = page.getByRole("dialog", { name: "New event" });
  await editor.getByLabel("Title").fill(unique("Trip"));
  const from = editor.getByRole("textbox", { name: "From" });
  const to = editor.getByRole("textbox", { name: "To" });
  await to.fill("2026-12-05");
  await from.fill("2026-12-08");
  await expect(to).toHaveValue("2026-12-08");

  await to.fill("2026-12-06");
  await expect(editor.getByText("The end cannot be before the start.")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Save" })).toBeDisabled();
  await to.fill("2026-12-09");
  await expect(editor.getByText("The end cannot be before the start.")).toBeHidden();

  // The same on one day with times.
  await to.fill("2026-12-08");
  await editor.getByRole("checkbox", { name: "All day" }).uncheck();
  await editor.getByLabel("Start time").selectOption("11:00");
  await editor.getByLabel("End time").selectOption("10:00");
  await expect(editor.getByText("The end cannot be before the start.")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Save" })).toBeDisabled();
  await editor.getByLabel("End time").selectOption("12:00");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
});

test("F-12 a palette of the eight legacy colours, brown by default", async ({ page }) => {
  const title = unique("Colours");
  await page.goto("/calendar?date=2026-12-03");
  await page.getByRole("button", { name: "New event" }).first().click();
  const colors = page
    .getByRole("dialog", { name: "New event" })
    .getByRole("group", { name: "Color" })
    .getByRole("radio");
  await expect(colors).toHaveCount(8);
  expect(await colors.evaluateAll((radios) => radios.map((radio) => radio.getAttribute("aria-label")))).toEqual([
    "Red",
    "Orange",
    "Yellow",
    "Green",
    "Blue",
    "Purple",
    "Brown",
    "Black",
  ]);
  await page.getByRole("button", { name: "Cancel" }).click();

  await createEvent(page, { title, color: "Purple" });
  await eventRow(page, title).click();
  const details = page.getByRole("dialog", { name: "Event details" });
  await expect(details.getByRole("radio", { name: "Purple" })).toBeChecked();
  // The colour changes from the details card as well.
  await details.getByRole("radio", { name: "Red" }).check({ force: true });
  await expect(page.getByText(`Color changed: ${title}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await eventRow(page, title).click();
  await expect(page.getByRole("dialog", { name: "Event details" }).getByRole("radio", { name: "Red" })).toBeChecked();
});

test("F-13 editing opens the same editor filled with the event", async ({ page }) => {
  const title = unique("Review");
  await createEvent(page, { date: "2026-12-04", title, start: "09:00", end: "09:30", location: "Desk" });
  await eventRow(page, title).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit event" });
  await expect(editor.getByLabel("Title")).toHaveValue(title);
  await expect(editor.getByLabel("Start time")).toHaveValue("09:00");
  await expect(editor.getByLabel("End time")).toHaveValue("09:30");
  await expect(editor.getByLabel("Location")).toHaveValue("Desk");
  await editor.getByLabel("Location").fill("Meeting room");
  await editor.getByLabel("End time").selectOption("10:00");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await expect(eventRow(page, title)).toContainText("Meeting room");
  await expect(eventRow(page, title)).toContainText("10:00");
});

test("F-14 the day lists all-day events first, then by start time, then by title", async ({ page }) => {
  // Legacy ordered by colour name (defect 7); FR-CAL-01 orders by time.
  const tag = unique("order");
  const day = "2026-12-07";
  await createEvent(page, { date: day, title: `B afternoon ${tag}`, start: "15:00", end: "16:00", color: "Red" });
  await createEvent(page, { title: `A morning ${tag}`, start: "08:00", end: "09:00", color: "Black" });
  await createEvent(page, { title: `C morning ${tag}`, start: "08:00", end: "09:00", color: "Blue" });
  await createEvent(page, { title: `Z all day ${tag}`, color: "Yellow" });
  // An event of another day is not listed.
  await createEvent(page, { date: "2026-12-08", title: `Other day ${tag}` });
  await page.goto(`/calendar?date=${day}`);
  const titles = page
    .getByRole("list", { name: "Events on Monday, December 7, 2026" })
    .getByRole("button", { name: new RegExp(`^Details of .*${tag}$`) });
  await expect(titles).toHaveCount(4);
  expect(await titles.evaluateAll((rows) => rows.map((row) => row.getAttribute("aria-label")))).toEqual([
    `Details of Z all day ${tag}`,
    `Details of A morning ${tag}`,
    `Details of C morning ${tag}`,
    `Details of B afternoon ${tag}`,
  ]);
});

test("F-15 click or right-click shows the details; a long description is cut at 50 characters", async ({ page }) => {
  const title = unique("Details");
  const description = "The quick brown fox jumps over the lazy dog, again and again and again.";
  await createEvent(page, { date: "2026-12-09", title, location: "Park", description });
  const row = eventRow(page, title);
  const details = page.getByRole("dialog", { name: "Event details" });

  await row.click({ button: "right" });
  await expect(details.getByRole("heading", { name: title })).toBeVisible();
  await expect(details).toContainText("All day");
  await expect(details).toContainText("Dec 9, 2026");
  await expect(details).toContainText("Park");
  await expect(details.getByText(`${description.slice(0, 50)}…`)).toBeVisible();
  await details.getByRole("button", { name: "more" }).click();
  await expect(details.getByText(description)).toBeVisible();
  for (const action of ["Edit", "Move to next day", "Delete"]) {
    await expect(details.getByRole("button", { name: action })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(row).toBeFocused();

  await row.click();
  await expect(details.getByRole("heading", { name: title })).toBeVisible();
});

test("F-16 delete asks first; the Delete key deletes the selected event", async ({ page }) => {
  const kept = unique("Kept");
  const gone = unique("Gone");
  await createEvent(page, { date: "2026-12-10", title: kept });
  await createEvent(page, { title: gone });

  // Cancel keeps the event.
  await eventRow(page, kept).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete event?" });
  await expect(confirm).toContainText(kept);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(eventRow(page, kept)).toBeVisible();

  // The Delete key on the focused row, confirmed with Enter.
  await eventRow(page, gone).focus();
  await page.keyboard.press("Delete");
  await expect(confirm).toContainText(gone);
  await expect(confirm.getByRole("button", { name: "Delete" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(eventRow(page, gone)).toBeHidden();
  await expect(eventRow(page, kept)).toBeVisible();
  await page.reload();
  await expect(eventRow(page, kept)).toBeVisible();
  await expect(eventRow(page, gone)).toBeHidden();
});

test("F-17 a deleted event is kept: it waits in the trash", async ({ page }) => {
  const title = unique("Soft");
  await createEvent(page, { date: "2026-12-11", title });
  await eventRow(page, title).click();
  await page.getByRole("dialog", { name: "Event details" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete event?" }).getByRole("button", { name: "Delete" }).click();
  await expect(eventRow(page, title)).toBeHidden();

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trash" }).click();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: title })).toBeVisible();
  // The server keeps the row with its deletion time (soft delete, FR-X-01).
  const trash = (await (await page.request.get("/api/v1/trash")).json()) as {
    data: { title: string; deleted_at: string }[];
  };
  expect(trash.data.find((entry) => entry.title === title)?.deleted_at).toBeTruthy();
});

test.fixme("F-19 a second editor is refused with a notice while one is open (HAAL-069)", async () => {});
