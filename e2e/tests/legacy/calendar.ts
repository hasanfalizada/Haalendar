// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. Steps the legacy scenarios share: a fixed "today" in the browser and
// an event made through the editor as a user makes it.
import { expect, type Page } from "@playwright/test";

/** "Today" of the legacy scenarios: Wednesday, 4 November 2026, 10:00 in Berlin; the browser clock runs on from it. */
export const TODAY = "2026-11-04";

export async function fixToday(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(`${TODAY}T10:00:00+01:00`) });
}

export interface NewEvent {
  title?: string;
  date?: string;
  to?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  color?: string;
  repeat?: string;
  /** The notification that says the write is done (default: "Event created: …"). */
  notification?: string;
}

/** Opens the day, makes the event in the editor and waits until the editor is closed. */
export async function createEvent(page: Page, event: NewEvent): Promise<void> {
  if (event.date) await page.goto(`/calendar?date=${event.date}`);
  await page.getByRole("button", { name: "New event" }).first().click();
  const editor = page.getByRole("dialog", { name: "New event" });
  if (event.title !== undefined) await editor.getByLabel("Title").fill(event.title);
  if (event.start) {
    await editor.getByRole("checkbox", { name: "All day" }).uncheck();
    await editor.getByLabel("Start time").selectOption(event.start);
    if (event.end) await editor.getByLabel("End time").selectOption(event.end);
  }
  if (event.to) await editor.getByRole("textbox", { name: "To" }).fill(event.to);
  if (event.repeat) await editor.getByLabel("Repeat").selectOption({ label: event.repeat });
  if (event.location) await editor.getByLabel("Location").fill(event.location);
  if (event.description) await editor.getByRole("textbox", { name: "Description" }).fill(event.description);
  // The swatch covers its radio button; the radio is checked through it, as a click on the swatch does.
  if (event.color) await editor.getByRole("radio", { name: event.color }).check({ force: true });
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  // The write has finished when its notification shows; leaving the page earlier is held by the app (unload_held).
  await written(page, event.notification ?? `Event created: ${event.title || "(No title)"}`);
}

/** Waits for the success notification of a write (the app holds a page unload while a write is unanswered). */
export async function written(page: Page, notification: string): Promise<void> {
  await expect(
    page
      .getByRole("region", { name: /^Notifications/ })
      .getByText(notification)
      .first(),
  ).toBeVisible();
}

/** The row of an event in the day list. */
export function eventRow(page: Page, title: string) {
  return page.getByRole("button", { name: `Details of ${title}` });
}
