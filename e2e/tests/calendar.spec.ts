// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. An event from the day view: create, see it, delete it, restore it
// from the trash.
import { expect, test, unique } from "../fixtures";

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
