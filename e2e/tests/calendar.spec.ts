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
