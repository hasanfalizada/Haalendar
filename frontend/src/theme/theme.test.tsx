// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Theme resolution, persistence, storage failures and the settings switch.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { json, me, renderApp, stubApi } from "@/test/fake-api";
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

  it("switches and persists the theme from settings", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
