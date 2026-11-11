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
