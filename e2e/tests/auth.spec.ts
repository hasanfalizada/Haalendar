// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Signing in and out with the administrator's password (its own
// session, so the stored one of the other scenarios stays valid).
import { ADMIN } from "../users";
import { expect, test } from "../fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("signs in, refuses a wrong password and signs out", async ({ page, watch }) => {
  // Expected: the session check before signing in and the wrong password (the app logs each as a warning).
  watch.allow(/^401 (GET \/api\/v1\/me|POST \/api\/v1\/auth\/login)$/);
  watch.allow(/api_request_failed .*status: 401/);
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/calendar/);

  await page.getByRole("button", { name: `Account menu of ${ADMIN.name}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/todo");
  await expect(page).toHaveURL(/\/login/);
});
