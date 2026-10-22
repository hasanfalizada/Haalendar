// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. User menu (FR-X-15): opens from the avatar by mouse and keyboard,
// Profile / Settings / Export lead to their sections of Settings (also when Settings is already open), Help opens the
// shortcut overlay and offers the documentation and issue links, About shows the version, licence and the author's
// and repository links, Sign out asks first when drafts exist, and the drawer on phones offers the same items.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { APP_VERSION, AUTHOR_URL, DOCS_URL, ISSUES_URL, LICENSE_URL, REPOSITORY_URL } from "@/lib/about";
import { saveDraft } from "@/lib/drafts";

import { json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

const MENU_BUTTON = "Account menu of Ada Admin";

// The drawer is not rendered while closed, so the rail's avatar is the only menu button.
const menuButton = () => screen.findByRole("button", { name: MENU_BUTTON });

async function openMenu() {
  const user = userEvent.setup();
  await user.click(await menuButton());
  const menu = await screen.findByRole("menu");
  return { user, menu };
}

describe("user menu", () => {
  // +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. The Markdown renderer is a lazily loaded chunk; its first import
  // under the test runner can take many seconds, so it is loaded once here instead of inside a single test.
  beforeAll(async () => {
    await import("@/components/markdown/MarkdownView");
  }, 60_000);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists who is signed in and every entry", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const { menu } = await openMenu();
    expect(within(menu).getByText("admin@example.org")).toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Profile", "Settings", "Export your data", "Sync and conflicts", "Help", "About Haalendar", "Sign out"]);
  });

  it("opens from the keyboard and returns the focus to the avatar on Escape", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const trigger = await menuButton();
    trigger.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(trigger).toHaveFocus();
  });

  it("leads to the profile and export sections, also when Settings is already open", async () => {
    stubApi({ "GET /me": () => json(me()) });
    const { router } = renderApp("/calendar");
    let { user, menu } = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Profile" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings");
    });
    const profile = await screen.findByRole("region", { name: "Profile" });
    await waitFor(() => {
      expect(profile).toHaveFocus();
    });

    ({ user, menu } = await openMenu());
    await user.click(within(menu).getByRole("menuitem", { name: "Export your data" }));
    const exportSection = await screen.findByRole("region", { name: "Your data" });
    await waitFor(() => {
      expect(exportSection).toHaveFocus();
    });
    expect(router.state.location.hash).toBe("export");

    ({ user, menu } = await openMenu());
    await user.click(within(menu).getByRole("menuitem", { name: "Settings" }));
    await waitFor(() => {
      expect(router.state.location.hash).toBe("");
    });
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("offers the shortcuts, documentation and issue tracker in Help", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Help" }));
    const help = await screen.findByRole("dialog", { name: "Help" });
    for (const [name, href] of [
      [/Documentation/, DOCS_URL],
      [/Report a problem/, ISSUES_URL],
    ] as const) {
      const link = within(help).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAccessibleName(expect.stringContaining("(opens in a new tab)"));
    }
    await user.click(within(help).getByRole("button", { name: /Keyboard shortcuts/ }));
    const overlay = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(screen.queryByRole("dialog", { name: "Help" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(overlay).toContainElement(document.activeElement as HTMLElement);
    });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: MENU_BUTTON })).toHaveFocus();
    });
  });

  // +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Help → Text formatting: the Markdown cheat sheet.
  it("opens the text formatting help from Help", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Help" }));
    const help = await screen.findByRole("dialog", { name: "Help" });
    await user.click(within(help).getByRole("button", { name: /Text formatting/ }));
    const sheet = await screen.findByRole("dialog", { name: "Text formatting" });
    expect(await within(sheet).findAllByText("bold", { selector: "strong" })).toHaveLength(2);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: MENU_BUTTON })).toHaveFocus();
    });
  });

  it("shows the version, the licence and the author's and repository links in About", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/todo");
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "About Haalendar" }));
    const about = await screen.findByRole("dialog", { name: "About Haalendar" });
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(within(about).getByText(`Version ${APP_VERSION}`)).toBeInTheDocument();
    expect(within(about).getByText(/free and open-source software/)).toBeInTheDocument();
    expect(within(about).getByText("Licence: Apache-2.0")).toBeInTheDocument();
    expect(within(about).getByRole("link", { name: /Author's website/ })).toHaveAttribute("href", AUTHOR_URL);
    expect(within(about).getByRole("link", { name: /Source code on GitHub/ })).toHaveAttribute("href", REPOSITORY_URL);
    expect(within(about).getByRole("link", { name: /Licence text/ })).toHaveAttribute("href", LICENSE_URL);
    for (const link of within(about).getAllByRole("link")) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: MENU_BUTTON })).toHaveFocus();
    });
  });

  it("signs out at once without drafts", async () => {
    let signedIn = true;
    const calls = stubApi({
      "GET /me": () => (signedIn ? json(me()) : problem(401, "session_expired")),
      "POST /auth/logout": () => {
        signedIn = false;
        return noContent();
      },
    });
    const { router } = renderApp("/kanban");
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(calls.some((c) => c.path === "/auth/logout")).toBe(true);
  });

  it("asks before signing out when drafts exist", async () => {
    const calls = stubApi({ "GET /me": () => json(me()), "POST /auth/logout": () => noContent() });
    await saveDraft(me().id, "profile", { display_name: "Ada!" });
    renderApp("/calendar");
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out and delete unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls.some((c) => c.path === "/auth/logout")).toBe(false);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: MENU_BUTTON })).toHaveFocus();
    });
  });

  it("offers the same items in the drawer on phones", async () => {
    stubApi({ "GET /me": () => json(me()) });
    const { router } = renderApp("/calendar");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Haalendar" });
    const toggle = within(drawer).getByRole("button", { name: MENU_BUTTON });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(within(drawer).getByRole("button", { name: "Export your data" }));
    await waitFor(() => {
      expect(router.state.location.hash).toBe("export");
    });
    expect(screen.queryByRole("dialog", { name: "Haalendar" })).not.toBeInTheDocument();
    const exportSection = await screen.findByRole("region", { name: "Your data" });
    await waitFor(() => {
      expect(exportSection).toHaveFocus();
    });
  });

  it("opens Help from the drawer with the focus inside the dialog", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Haalendar" });
    await user.click(within(drawer).getByRole("button", { name: MENU_BUTTON }));
    await user.click(within(drawer).getByRole("button", { name: "Help" }));
    const help = await screen.findByRole("dialog", { name: "Help" });
    await waitFor(() => {
      expect(help).toContainElement(document.activeElement as HTMLElement);
    });
  });
});
