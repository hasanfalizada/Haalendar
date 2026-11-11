// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. A note: create it and find it again after a reload (it reached the
// server and comes back from it).
import { expect, test, unique } from "../fixtures";

test("creates a note that is still there after a reload", async ({ page }) => {
  const title = unique("Call the bank");
  await page.goto("/todo");
  await page.getByRole("button", { name: "New note" }).first().click();
  const editor = page.getByRole("dialog", { name: "New note" });
  await editor.getByLabel("Title").fill(title);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("article", { name: title })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("article", { name: title })).toBeVisible();
});
