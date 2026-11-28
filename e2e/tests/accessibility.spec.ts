// +++===+++ 2026-11-26 13:10 +04 — Hasan Alizada — HAAL-143 (NFR 4.6, D-127). Accessibility of every screen: axe with
// the WCAG 2.0, 2.1 and 2.2 rules of levels A and AA, in the light and the dark theme, at 1280 px with a mouse and at
// 360 px on a touch phone. On the phone, besides: no page scrolls sideways and every button, link, tab and menu item is
// at least 44 × 44 px (SRS 4.6, D-53). The few exceptions are named below with their reason.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test, unique } from "../fixtures";
import { createEvent } from "./legacy/calendar";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

/**
 * Label in name (2.5.3) is checked everywhere except on the items that show more than their name: an event ("Details
 * of <title>"), a note or a card tile and a due date ("Open <title>"). Their name holds the title, which is what labels
 * them; the time, the text preview and the badges are information about the item, read as its description.
 */
const MORE_THAN_THEIR_NAME = [
  '[aria-label^="Details of "]',
  "[data-note]",
  "[data-card]",
  '[aria-label^="Open the card "]',
  '[aria-label^="Open the note "]',
];

/** Fails with the rules broken on the page as it is now, and where. */
async function audit(page: Page, screen: string): Promise<void> {
  // The page settles (fonts, the first data, animations of a dialog) before it is read.
  await page.waitForTimeout(400);
  const all = await new AxeBuilder({ page })
    .withTags(WCAG)
    .disableRules(["label-content-name-mismatch", "target-size"])
    .analyze();
  // Target size (2.5.8) everywhere but on the events of the week's grid: their size is the time they last (the
  // essential exception); the day list shows the same events as large rows.
  const sized = await new AxeBuilder({ page }).withRules(["target-size"]).exclude("[data-week-grid]").analyze();
  let names = new AxeBuilder({ page }).withRules(["label-content-name-mismatch"]);
  for (const selector of MORE_THAN_THEIR_NAME) names = names.exclude(selector);
  const named = await names.analyze();
  const broken = [...all.violations, ...sized.violations, ...named.violations].map(
    (rule) => `${rule.id}: ${rule.nodes.map((node) => node.target.join(" ")).join(" | ")}`,
  );
  expect.soft(broken, `axe on ${screen}`).toEqual([]);
}

/**
 * On a touch phone: nothing scrolls the page sideways, and the controls of the top layer (an open dialog, a menu, or
 * else the page) are at least 44 × 44 px. Not counted: check boxes and radio buttons (20 px, their label is the 44 px
 * target, D-53), links inside running text (the inline exception of 2.5.8), and the events on the week's grid, whose
 * size is the length they last (the essential exception; the day list shows the same events as 44 px rows).
 */
async function phoneChecks(page: Page, screen: string): Promise<void> {
  const found = await page.evaluate(() => {
    const layers = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]')].filter(
      (layer) => layer.checkVisibility(),
    );
    const root = layers.at(-1) ?? document.body;
    const controls = root.querySelectorAll(
      'button, a[href], select, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="switch"]',
    );
    const small: string[] = [];
    for (const control of controls) {
      if (!(control instanceof HTMLElement) || !control.checkVisibility({ opacityProperty: true })) continue;
      if (control.closest('.sr-only, [aria-hidden="true"], [data-week-grid]')) continue;
      if (control.matches("p a, li > p a")) continue;
      const box = control.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      if (box.width < 43.5 || box.height < 43.5) {
        const name = control.getAttribute("aria-label") ?? control.textContent.trim();
        small.push(
          `${control.tagName.toLowerCase()} "${name.slice(0, 40)}" ${String(Math.round(box.width))}×${String(Math.round(box.height))}`,
        );
      }
    }
    return { sideways: document.documentElement.scrollWidth > window.innerWidth, small };
  });
  expect.soft(found.sideways, `${screen} scrolls sideways`).toBe(false);
  expect.soft(found.small, `targets under 44 px on ${screen}`).toEqual([]);
}

interface Seeded {
  event: string;
  allDay: string;
  note: string;
  board: string;
  card: string;
}

const DAY = "2027-06-16";

/** Content for the screens to show: a timed and an all-day event, a note, a board with a card. */
async function seed(page: Page): Promise<Seeded> {
  const made: Seeded = {
    event: unique("Design review"),
    allDay: unique("Team offsite"),
    note: unique("Book list"),
    board: unique("Launch"),
    card: unique("Write the copy"),
  };
  await createEvent(page, {
    title: made.event,
    date: DAY,
    start: "10:00",
    end: "11:30",
    description: "Bring the **slides**.",
  });
  await createEvent(page, { title: made.allDay, date: DAY });

  await page.goto("/todo");
  await page.getByRole("button", { name: "New note" }).first().click();
  const editor = page.getByRole("dialog", { name: "New note" });
  await editor.getByLabel("Title").fill(made.note);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();

  await page.goto("/kanban");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByRole("dialog", { name: "New board" }).getByLabel("Name").fill(made.board);
  await page.keyboard.press("Enter");
  const todo = page.getByRole("region", { name: "To do" });
  await todo.getByRole("button", { name: "Add card to To do" }).click();
  await todo.getByLabel("Title of the new card in To do").fill(made.card);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`Card added: ${made.card}`)).toBeVisible();
  await page.keyboard.press("Escape");
  return made;
}

/** Every screen and the dialogs on them; `check` runs on each. */
async function everyScreen(page: Page, check: (screen: string) => Promise<void>, phone: boolean): Promise<void> {
  const made = await seed(page);
  const boardUrl = page.url();

  for (const view of ["day", "week", "month", "agenda"]) {
    await page.goto(`/calendar?date=${DAY}&view=${view}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await check(`the calendar, ${view}`);
  }
  await page.goto(`/calendar?date=${DAY}&view=day`);
  await page.getByRole("button", { name: `Details of ${made.event}` }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await check("the details of an event");
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeVisible();
  await check("the event editor");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit event" })).toBeHidden();

  await page.goto("/todo");
  await expect(page.getByRole("article", { name: made.note })).toBeVisible();
  await check("To-Do");
  await page
    .getByRole("article", { name: made.note })
    .getByRole("button", { name: `Open ${made.note}` })
    .click();
  await expect(page.getByRole("dialog", { name: "Edit note" })).toBeVisible();
  await check("the note editor");
  await page.keyboard.press("Escape");

  await page.goto("/kanban");
  await expect(page.getByRole("link", { name: made.board })).toBeVisible();
  await check("the boards");
  await page.goto(boardUrl);
  const card = page.getByRole("button", { name: `Open ${made.card}` });
  await expect(card).toBeVisible();
  await check("a board");
  await card.click();
  await expect(page.getByRole("dialog", { name: "Edit card" })).toBeVisible();
  await check("the card editor");
  await page.keyboard.press("Escape");

  for (const [path, screen] of [
    ["/trash", "the trash"],
    ["/settings", "the settings"],
    ["/admin", "the users"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await check(screen);
  }

  await page.goto(`/calendar?date=${DAY}&view=day`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  if (phone) {
    await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
  } else {
    await page.keyboard.press("Control+k");
  }
  await expect(page.getByRole("combobox", { name: "Commands and search" })).toBeVisible();
  await check("the command palette");
  await page.keyboard.press("Escape");

  if (phone) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await check("the menu drawer");
  } else {
    await page.getByRole("button", { name: /^Account menu/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await check("the account menu");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await check("the keyboard shortcuts");
  }
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the pages before signing in pass axe", async ({ browser }) => {
      const context = await browser.newContext({
        colorScheme,
        locale: "en-US",
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      for (const [path, screen] of [
        ["/login", "the sign-in page"],
        ["/forgot-password", "the forgotten password page"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await audit(page, screen);
      }
      await context.close();
    });

    test("every screen passes axe on a computer", async ({ page }) => {
      test.setTimeout(240_000);
      await everyScreen(page, (screen) => audit(page, screen), false);
    });

    test.describe("on a touch phone 360 px wide", () => {
      test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

      test("every screen passes axe, scrolls only down and has 44 px targets", async ({ page }) => {
        test.setTimeout(240_000);
        await everyScreen(
          page,
          async (screen) => {
            await audit(page, screen);
            await phoneChecks(page, screen);
          },
          true,
        );
      });
    });
  });
}
