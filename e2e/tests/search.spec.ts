// +++===+++ 2026-11-23 15:45 +04 — Hasan Alizada — HAAL-039 (D-119). The search: the small field in a header opens the
// window over the dimmed page; accents and case do not matter, the words may come in any order and the place they were
// found is shown highlighted; arrow keys and Enter open a card on its board; on phones the field is in the top bar.
import { expect, test, unique } from "../fixtures";

import { createEvent, fixToday } from "./legacy/calendar";

test("finds a note by its description and a card on its board, from the keyboard", async ({ page }) => {
  const tag = unique("Srch").split(" ")[1] ?? "";
  const note = `Weekend ideas ${tag}`;
  const board = `Home ${tag}`;
  const card = `Paint the café door ${tag}`;

  await page.goto("/todo");
  await page.getByRole("button", { name: "New note" }).first().click();
  const editor = page.getByRole("dialog", { name: "New note" });
  await editor.getByLabel("Title").fill(note);
  await editor.getByRole("textbox", { name: "Note" }).fill(`Try the new **Café Lumière** downtown ${tag}`);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();

  await page.goto("/kanban");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByRole("dialog", { name: "New board" }).getByLabel("Name").fill(board);
  await page.keyboard.press("Enter");
  const todo = page.getByRole("region", { name: "To do" });
  await todo.getByRole("button", { name: "Add a card to To do" }).click();
  await todo.getByLabel("Title of the new card in To do").fill(card);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`Card added: ${card}`)).toBeVisible();
  await page.keyboard.press("Escape");

  // The field in the header; the page behind the window is dimmed and the field takes the typing.
  await page.goto("/calendar?date=2027-08-02");
  await page.getByRole("main").getByRole("button", { name: "Search" }).click();
  const search = page.getByRole("combobox", { name: "Search" });
  await expect(search).toBeFocused();
  await search.fill(`${tag} CAFE`);

  const notes = page.getByRole("group", { name: "To-Do" }).getByRole("option");
  await expect(notes).toHaveCount(1);
  await expect(notes).toContainText(note);
  await expect(notes).toContainText("Description: Try the new Café Lumière downtown"); // Markdown as plain text
  await expect(notes.locator("mark", { hasText: "Café" })).toHaveText("Café"); // found without the accent
  const cards = page.getByRole("group", { name: "Boards" }).getByRole("option");
  await expect(cards).toContainText(card);
  await expect(cards).toContainText(board);
  await expect(cards.locator("mark", { hasText: "café" })).toBeVisible();

  // The first result is active; the arrow moves to the card, Enter opens it on its board.
  await expect(notes).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowDown");
  await expect(cards).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/kanban\/[0-9a-f-]+\?card=/);
  const opened = page.getByRole("dialog", { name: "Edit card" });
  await expect(opened.getByLabel("Title")).toHaveValue(card);
  await opened.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(board);

  await page.keyboard.press("/");
  await search.fill(`nothing like this ${tag}`);
  await expect(page.getByText(`Nothing found for “nothing like this ${tag}”.`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test("the search field is in the top bar and the window takes the screen", async ({ page }) => {
    await page.goto("/calendar?date=2027-08-02");
    await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
    const window = page.getByRole("dialog", { name: "Search" });
    // Measured once it has opened out.
    await window.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    expect(await window.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 800 });
    await window.getByRole("button", { name: "Close the search" }).click();
    await expect(window).toBeHidden();
  });
});

// +++===+++ 2026-11-23 12:30 +04 — Hasan Alizada — HAAL-046 (D-120). The filters under the field: colour and this week
// narrow the events, without words too; a module leaves the rest out; Reset; they stay when the search opens again.
test("filters narrow the search by colour, dates and module, without words too", async ({ page }) => {
  await fixToday(page); // Wednesday, 4 November 2026
  const tag = unique("Flt").split(" ")[1] ?? "";
  await createEvent(page, { date: "2026-11-05", title: `Red this week ${tag}`, color: "Red" });
  await createEvent(page, { date: "2026-12-10", title: `Red next month ${tag}`, color: "Red" });
  await createEvent(page, { date: "2026-11-06", title: `Blue this week ${tag}`, color: "Blue" });

  await page.keyboard.press("/");
  const window = page.getByRole("dialog", { name: "Search" });
  const search = window.getByRole("combobox", { name: "Search" });
  await search.fill(tag);
  const events = window.getByRole("group", { name: "Calendar" }).getByRole("option");
  await expect(events).toHaveCount(3);

  await window.getByRole("button", { name: "Colour" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Red" }).click();
  await page.keyboard.press("Escape"); // the menu closes, the search stays
  await expect(window).toBeVisible();
  await expect(events).toHaveCount(2);
  await window.getByRole("button", { name: "Dates" }).click();
  await page.getByRole("menuitemcheckbox", { name: "This week" }).click();
  await page.keyboard.press("Escape");
  await expect(window.getByRole("button", { name: "This week" })).toBeVisible();
  await expect(events).toHaveCount(1);
  await expect(events).toContainText(`Red this week ${tag}`);

  // Without words the filters alone list what matches them.
  await search.fill("");
  await expect(events.filter({ hasText: `Red this week ${tag}` })).toHaveCount(1);
  await expect(events.filter({ hasText: tag })).toHaveCount(1);

  // A module leaves the others out.
  await search.fill(tag);
  await window.getByRole("button", { name: "Module" }).click();
  await page.getByRole("menuitemcheckbox", { name: "To-Do" }).click();
  await page.keyboard.press("Escape");
  await expect(events).toHaveCount(0);
  await expect(window.getByText("Nothing found for")).toBeVisible();

  // Kept when the search opens again; Reset clears them.
  await page.keyboard.press("Escape");
  await expect(window).toBeHidden();
  await page.keyboard.press("/");
  await expect(window.getByRole("button", { name: "Colour · 1" })).toBeVisible();
  await window.getByRole("button", { name: "Reset" }).click();
  await search.fill(tag);
  await expect(events).toHaveCount(3);
});
