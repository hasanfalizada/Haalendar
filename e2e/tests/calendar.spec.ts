// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. An event from the day view: create, see it, delete it, restore it
// from the trash.
import type { Page } from "@playwright/test";

import { expect, test, unique } from "../fixtures";
import { createEvent } from "./legacy/calendar";

test("creates an event, deletes it and restores it from the trash", async ({ page }) => {
  const title = unique("Dentist");
  await page.goto("/calendar?date=2026-11-04");
  await page.getByRole("button", { name: "New event" }).first().click();
  const editor = page.getByRole("dialog", { name: "New event" });
  await editor.getByLabel("Title").fill(title);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  const row = page.getByRole("button", { name: new RegExp(title) });
  await expect(row).toBeVisible();

  await row.click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete event?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Deleted ${title}`)).toBeVisible();
  await expect(row).toBeHidden();

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Trash" }).click();
  const entry = page.getByRole("main").getByRole("listitem").filter({ hasText: title });
  await entry.getByRole("button", { name: "Restore" }).click();
  await expect(entry).toBeHidden();

  await page.goto("/calendar?date=2026-11-04");
  await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible();
});

// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F5). On a 1280×720 laptop the details of an event low
// in the day list stay inside the window, so Edit and Delete can be reached (they ended below the screen).
test.describe("on a short screen", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("the details of an event low in the day list stay inside the window", async ({ page }) => {
    const day = "2027-03-17";
    const titles = Array.from({ length: 7 }, (_, n) => unique(`Slot ${String(n)}`));
    for (const [n, title] of titles.entries()) {
      await page.goto(`/calendar?date=${day}`);
      await page.getByRole("button", { name: "New event" }).first().click();
      const editor = page.getByRole("dialog", { name: "New event" });
      await editor.getByLabel("Title").fill(title);
      if (n === titles.length - 1) {
        await editor
          .getByRole("textbox", { name: "Description" })
          .fill(Array.from({ length: 30 }, (_, line) => `Line ${String(line)}`).join("\n\n"));
      }
      await editor.getByRole("button", { name: "Save" }).click();
      const anyway = page.getByRole("button", { name: "Save anyway" });
      if (await anyway.isVisible().catch(() => false)) await anyway.click();
      await expect(editor).toBeHidden();
    }
    const last = titles.at(-1) ?? "";
    await page.getByRole("button", { name: new RegExp(last) }).click();
    const details = page.getByRole("dialog", { name: "Event details" });
    await expect(details).toBeVisible();
    const box = await details.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
    const remove = details.getByRole("button", { name: "Delete" });
    await remove.scrollIntoViewIfNeeded();
    const button = await remove.boundingBox();
    expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual(720);
  });
});

// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F23). An event at any minute, e.g. a meeting at 20:50.
test("an event can start and end at any minute", async ({ page }) => {
  const title = unique("Call");
  await page.goto("/calendar?date=2027-03-18");
  await page.getByRole("button", { name: "New event" }).first().click();
  const editor = page.getByRole("dialog", { name: "New event" });
  await editor.getByLabel("Title").fill(title);
  await editor.getByRole("checkbox", { name: "All day" }).uncheck();
  await editor.getByLabel("Start time").fill("20:50");
  await editor.getByLabel("End time").fill("21:07");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(title) })).toContainText("20:50");
});

// +++===+++ 2026-11-18 21:44 +04 — Hasan Alizada — HAAL-186. With a mouse from 768 px the rows of the day list and of
// the agenda are one compact line (D-53, about 30 px an event as in the legacy calendar), the place on the same line;
// on a touch screen they keep the 44 px target.
async function rowsOf(page: Page, view: "day" | "agenda", tag: string) {
  await page.goto(`/calendar?date=2027-04-14&view=${view}`);
  const rows = page.getByRole("listitem").filter({ hasText: tag });
  await expect(rows).toHaveCount(2);
  return rows.evaluateAll((items) =>
    items.map((item) => ({ height: item.getBoundingClientRect().height, top: item.getBoundingClientRect().top })),
  );
}

test("the rows of a day are compact with a mouse", async ({ page }) => {
  const tag = unique("Compact");
  await createEvent(page, {
    date: "2027-04-14",
    title: `Lunch ${tag}`,
    start: "12:00",
    end: "13:00",
    location: "Café",
  });
  await createEvent(page, { title: `Call ${tag}`, start: "14:00", end: "14:30" });
  for (const view of ["day", "agenda"] as const) {
    const [first, second] = await rowsOf(page, view, tag);
    expect(first?.height, `${view}: one line with the place`).toBeLessThanOrEqual(30);
    expect((second?.top ?? 0) - (first?.top ?? 0), `${view}: the step between rows`).toBeLessThanOrEqual(32);
  }
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("the rows of a day keep the 44 px target", async ({ page }) => {
    const tag = unique("Touch");
    await createEvent(page, { date: "2027-04-14", title: `Lunch ${tag}`, start: "12:00", end: "13:00" });
    await createEvent(page, { title: `Call ${tag}`, start: "14:00", end: "14:30" });
    for (const view of ["day", "agenda"] as const) {
      for (const row of await rowsOf(page, view, tag)) expect(row.height, view).toBeGreaterThanOrEqual(44);
    }
  });
});

// +++===+++ 2026-11-18 22:47 +04 — Hasan Alizada — HAAL-187. ‹ Today › stay in place from day to day, week to week and
// month to month, however long the date beside them is; on a phone too.
async function navPlaces(page: Page) {
  const places: string[] = [];
  for (const view of ["day", "week", "month", "agenda"]) {
    for (const date of ["2026-05-01", "2026-09-30", "2026-12-24"]) {
      await page.goto(`/calendar?date=${date}&view=${view}`);
      const header = page.getByRole("main");
      await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
      const boxes = await Promise.all(
        [/^Previous (day|week|month|days)$/, /^Today$/, /^Next (day|week|month|days)$/].map((name) =>
          header.getByRole("button", { name }).last().boundingBox(),
        ),
      );
      places.push(`${view}: ${boxes.map((box) => `${String(box?.x)},${String(box?.y)}`).join(" ")}`);
    }
  }
  return places;
}

function expectSteady(places: string[]) {
  const positions = places.map((place) => place.slice(place.indexOf(":") + 1));
  expect(new Set(positions), places.join("\n")).toHaveProperty("size", 1);
}

test("previous, Today and next stay in place", async ({ page }) => {
  expectSteady(await navPlaces(page));
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("previous, Today and next stay in place", async ({ page }) => {
    expectSteady(await navPlaces(page));
  });
});
