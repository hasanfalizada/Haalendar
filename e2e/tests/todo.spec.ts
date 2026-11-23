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

// +++===+++ 2026-11-18 15:40 +04 — Hasan Alizada — HAAL-103. The manual order (D-110): a note moved with Alt+↓ and one
// dragged by its handle keep their places after a reload (the position reached the server); the List layout is kept too.
test("orders notes by keyboard and by dragging, and keeps the list layout", async ({ page }) => {
  const first = unique("Water the plants");
  const second = unique("Book the tickets");
  await page.goto("/todo");
  for (const title of [first, second]) {
    await page.getByRole("button", { name: "New note" }).first().click();
    const editor = page.getByRole("dialog", { name: "New note" });
    await editor.getByLabel("Title").fill(title);
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toBeHidden();
  }
  // Both are in the same section (the user's unpinned notes), whatever its heading.
  const order = async () => {
    const names = await page
      .getByRole("article")
      .evaluateAll((cards) => cards.map((c) => c.getAttribute("aria-label")));
    if (!names.includes(first) || !names.includes(second)) return Number.NaN;
    return names.indexOf(first) - names.indexOf(second);
  };
  // The move has reached the server before the page is reloaded (a reload with a change still to send is held).
  const sent = () => page.waitForResponse((r) => r.url().endsWith("/api/v1/sync/push") && r.ok());
  // A new note goes on top: the second one is first.
  await expect.poll(order).toBeGreaterThan(0);

  await page.getByRole("button", { name: `Open ${second}` }).focus();
  let pushed = sent();
  await page.keyboard.press("Alt+ArrowDown");
  await pushed;
  await expect(page.getByText(`Moved ${second}`).first()).toBeVisible();
  await expect.poll(order).toBeLessThan(0);
  await page.reload();
  await expect.poll(order).toBeLessThan(0);

  const handle = page.getByRole("button", { name: `Drag ${second} to another place` });
  const target = page.getByRole("article", { name: first });
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("no box to drag");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  pushed = sent();
  await page.mouse.up();
  await pushed;
  await expect.poll(order).toBeGreaterThan(0);
  await page.reload();
  await expect.poll(order).toBeGreaterThan(0);

  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/me/settings") && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("radio", { name: "List" }).click();
  await saved;
  await page.reload();
  await expect(page.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Grid" }).click();
  await expect(page.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
});
