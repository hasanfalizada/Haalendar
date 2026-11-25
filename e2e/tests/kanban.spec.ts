// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. A board with its default columns and a card that survives a reload.
import { expect, test, unique } from "../fixtures";

test("creates a board and a card that is still there after a reload", async ({ page }) => {
  const board = unique("Home");
  const card = unique("Paint the door");
  await page.goto("/kanban");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByRole("dialog", { name: "New board" }).getByLabel("Name").fill(board);
  await page.keyboard.press("Enter");
  const todo = page.getByRole("region", { name: "To do" });
  await expect(todo).toBeVisible();

  await todo.getByRole("button", { name: "Add a card to To do" }).click();
  await todo.getByLabel("Title of the new card in To do").fill(card);
  await page.keyboard.press("Enter");
  await expect(page.getByText(`Card added: ${card}`)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("region", { name: "To do" }).getByRole("button", { name: `Open ${card}` })).toBeVisible();
});

// +++===+++ 2026-11-25 09:48 +04 — Hasan Alizada — HAAL-114 (FR-KAN-05, D-123). A comment written in the card editor
// stays after a reload, its change marks it "edited", its delete is undone; the card's history reads its changes.
test("comments on a card and its activity", async ({ page }) => {
  const board = unique("Comments");
  const card = unique("Write the plan");
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

  const open = async () => {
    await page
      .getByRole("region", { name: "To do" })
      .getByRole("button", { name: `Open ${card}` })
      .click();
    return page.getByRole("dialog", { name: "Edit card" });
  };
  let editor = await open();
  const feed = editor.getByRole("list", { name: "Activity" });
  // The history comes once the card has reached the server.
  await expect(feed).toContainText("You created the card");
  await editor.getByLabel("Comment", { exact: true }).fill("First **draft** is ready");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText(`Comment added to ${card}`)).toBeVisible();
  await expect(feed.getByRole("listitem", { name: "Comment by You" })).toContainText("First draft is ready");
  await editor.getByLabel("Title").fill(`${card} v2`);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();

  await page.reload();
  await page
    .getByRole("region", { name: "To do" })
    .getByRole("button", { name: `Open ${card} v2` })
    .click();
  editor = page.getByRole("dialog", { name: "Edit card" });
  const comment = editor.getByRole("listitem", { name: "Comment by You" });
  await expect(comment).toContainText("First draft is ready");
  await expect(editor.getByRole("list", { name: "Activity" })).toContainText("You changed the title");

  await comment.getByRole("button", { name: "Change the comment" }).click();
  await comment.getByLabel("Text of the comment", { exact: true }).fill("Final draft is ready");
  await comment.getByRole("button", { name: "Save" }).click();
  await expect(comment).toContainText("edited");
  await expect(comment).toContainText("Final draft is ready");

  await comment.getByRole("button", { name: "Delete the comment" }).click();
  const toast = page.getByRole("region", { name: /^Notifications/ }).getByText("Comment deleted");
  await expect(toast).toBeVisible();
  await expect(comment).toBeHidden();
  await page
    .getByRole("region", { name: /^Notifications/ })
    .getByRole("listitem")
    .filter({ hasText: "Comment deleted" })
    .getByRole("button", { name: "Undo" })
    // The modal editor keeps the page inert: the message's Undo is pressed directly.
    .dispatchEvent("click");
  await expect(editor.getByRole("listitem", { name: "Comment by You" })).toContainText("Final draft is ready");
});

// +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (FR-INT-02, D-125). A note converted to a card on a board
// opens there with its history saying so; Undo makes it a note again, still one after a reload.
test("converts a note to a card and back", async ({ page }) => {
  const board = unique("Errands");
  const title = unique("Renew the passport");
  await page.goto("/kanban");
  await page.getByRole("button", { name: "New board" }).first().click();
  await page.getByRole("dialog", { name: "New board" }).getByLabel("Name").fill(board);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "To do" })).toBeVisible();

  await page.goto("/todo");
  await page.getByRole("button", { name: "New note" }).first().click();
  const created = page.getByRole("dialog", { name: "New note" });
  await created.getByLabel("Title").fill(title);
  await created.getByRole("button", { name: "Save" }).click();
  await expect(created).toBeHidden();
  await page.getByRole("button", { name: `Open ${title}` }).click();
  const editor = page.getByRole("dialog", { name: "Edit note" });
  // Enabled once the note has reached the server.
  await editor.getByRole("button", { name: "Convert to…" }).click();
  const dialog = page.getByRole("dialog", { name: `Convert ${title}` });
  await dialog.getByLabel("Convert to").selectOption("card");
  await dialog.getByLabel("Board").selectOption({ label: board });
  await expect(dialog.getByLabel("Column")).toHaveValue(/.+/);
  await dialog.getByRole("button", { name: "Convert" }).click();

  await expect(page.getByText(`${title} is now a card.`)).toBeVisible();
  const card = page.getByRole("dialog", { name: "Edit card" });
  await expect(card.getByLabel("Title")).toHaveValue(title);
  await expect(page).toHaveURL(/\/kanban\//);
  await expect(card.getByText("converted it to a card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(
    page.getByRole("region", { name: "To do" }).getByRole("button", { name: `Open ${title}` }),
  ).toBeVisible();

  await page
    .getByRole("listitem")
    .filter({ hasText: `${title} is now a card.` })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(page.getByRole("region", { name: "To do" }).getByRole("button", { name: `Open ${title}` })).toBeHidden();
  await page.goto("/todo");
  await page.reload();
  await expect(page.getByRole("article", { name: title })).toBeVisible();
});
