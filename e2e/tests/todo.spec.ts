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

// +++===+++ 2026-11-17 22:40 +04 — Hasan Alizada — HAAL-102. A personal label (D-109): made in the note editor, put on
// the note with Save, still there after a reload, and the Labels menu filters by it (`?labels=`).
test("labels a note and filters by the label", async ({ page }) => {
  const title = unique("Pack for the trip");
  const other = unique("Pay the rent");
  const name = unique("Trips");
  await page.goto("/todo");
  for (const note of [other, title]) {
    await page.getByRole("button", { name: "New note" }).first().click();
    const editor = page.getByRole("dialog", { name: "New note" });
    await editor.getByLabel("Title").fill(note);
    if (note === title) {
      await editor.getByRole("button", { name: "New label…" }).click();
      const dialog = page.getByRole("dialog", { name: "New label" });
      await dialog.getByLabel("Name").fill(name);
      await dialog.getByRole("button", { name: "Create" }).click();
      await expect(dialog).toBeHidden();
      await expect(editor.getByRole("button", { name, pressed: true })).toBeVisible();
    }
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toBeHidden();
  }
  await expect(page.getByRole("article", { name: title })).toContainText(name);

  await page.reload();
  await expect(page.getByRole("article", { name: title })).toContainText(name);
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/[?&]labels=/);
  await expect(page.getByRole("article", { name: title })).toBeVisible();
  await expect(page.getByRole("article", { name: other })).toBeHidden();
});
