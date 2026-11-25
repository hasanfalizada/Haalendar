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
