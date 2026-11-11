// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Theme resolution, persistence, storage failures and the settings switch.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { json, me, renderApp, settings, stubApi } from "@/test/fake-api";
import { stubMatchMedia } from "@/test/setup";

import { readPreference, resolveTheme, THEME_STORAGE_KEY, writePreference } from "./theme";

describe("theme logic", () => {
  it("resolves system preference from the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("defaults to system for missing or invalid stored values", () => {
    expect(readPreference({ getItem: () => null })).toBe("system");
    expect(readPreference({ getItem: () => "purple" })).toBe("system");
    expect(readPreference({ getItem: () => "dark" })).toBe("dark");
  });

  it("never throws when storage is blocked", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(readPreference(throwing)).toBe("system");
    expect(() => {
      writePreference("dark", throwing);
    }).not.toThrow();
  });
});

describe("theme in the app", () => {
  function renderSettings() {
    // +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. A realistic signed-in user (the page shows the profile too).
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/settings");
  }

  it("follows the OS dark setting when preference is system", async () => {
    stubMatchMedia(true);
    renderSettings();
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    stubMatchMedia(false);
  });

  // +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The theme is a user setting: a click previews it, Save stores it
  // on the server and caches it on the device.
  it("previews the theme at once and stores it with the preferences", async () => {
    const user = userEvent.setup();
    let saved = settings();
    stubApi({
      "GET /me": () => json(me()),
      "GET /me/settings": () => json(saved),
      "PATCH /me/settings": (call) => {
        saved = { ...saved, ...(call.body as object), version: saved.version + 1 };
        return json(saved);
      },
    });
    renderApp("/settings");
    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull(); // a preview is not stored
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: "Save preferences" }));
    await waitFor(() => {
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });
    expect(saved.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the theme stored in the user's settings on this device", async () => {
    stubApi({ "GET /me": () => json(me()), "GET /me/settings": () => json(settings({ theme: "dark" })) });
    renderApp("/calendar");
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
