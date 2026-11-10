// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Never lose typed text (D-39), on the profile form: a failed save
// keeps the edits on the device, they survive closing the page and are offered for restore; after a conflict the
// edits come back too; a confirmed save removes the draft; signing out with a draft asks first.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadDraft, wipeDrafts } from "@/lib/drafts";
import { DRAFT_DELAY_MS } from "@/lib/useDraft";

import { json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

const ADA = me({ display_name: "Ada Admin" });

// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. These cases type whole forms with user-event, which takes close to
// the default 5 s in jsdom on WSL drives (and more under machine load): a longer budget, not a weaker test.
describe("drafts on the profile form", { timeout: 15_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the edits when the save fails and offers them after the page is reopened", async () => {
    let online = false;
    let current = ADA;
    stubApi({
      "GET /me": () => json(current),
      "PATCH /me": (call) => {
        if (!online) throw new TypeError("Failed to fetch");
        current = { ...current, ...(call.body as object), version: 2 };
        return json(current);
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), " Lovelace");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("the server cannot be reached");
    expect(alert).toHaveTextContent("Your text is kept on this device.");
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Admin Lovelace");
    expect((await loadDraft(ADA.id, "profile"))?.fields.display_name).toBe("Ada Admin Lovelace");

    // The tab is closed and opened again later.
    cleanup();
    online = true;
    renderApp("/settings");
    expect(await screen.findByText(/Unsaved changes from .* were kept on this device\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Admin");
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Admin Lovelace");

    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    await waitFor(async () => {
      expect(await loadDraft(ADA.id, "profile")).toBeNull();
    });
  });

  it("brings the edits back after a conflict", async () => {
    let current = ADA;
    stubApi({
      "GET /me": () => json(current),
      "PATCH /me": () => {
        current = { ...current, display_name: "Changed Elsewhere", version: 5 };
        return problem(412, "version_conflict");
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    const name = await screen.findByLabelText("Display name");
    await user.clear(name);
    await user.type(name, "My careful edit");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("your changes are kept and can be restored");
    await waitFor(() => {
      expect(screen.getByLabelText("Display name")).toHaveValue("Changed Elsewhere");
    });
    await user.click(await screen.findByRole("button", { name: "Restore" }));
    expect(screen.getByLabelText("Display name")).toHaveValue("My careful edit");
  });

  it("can discard an offered draft", async () => {
    stubApi({ "GET /me": () => json(ADA), "PATCH /me": () => Promise.reject(new TypeError("Failed to fetch")) });
    renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByRole("alert");

    cleanup();
    renderApp("/settings");
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(screen.queryByText(/Unsaved changes from/)).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await loadDraft(ADA.id, "profile")).toBeNull();
    });
  });

  it("asks before signing out with unsaved changes and deletes them", async () => {
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "PATCH /me": () => Promise.reject(new TypeError("Failed to fetch")),
      "POST /auth/logout": () => noContent(),
    });
    const { router } = renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out and delete unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Sign out anyway" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/auth/logout")).toBe(true);
    });
    // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. A CI runner under load needs more than the default second.
    await waitFor(
      async () => {
        expect(await loadDraft(ADA.id, "profile")).toBeNull();
      },
      { timeout: 10_000 },
    );
    // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The person has answered and the session is over: the guard of the
    // open form must not hold the way out, and its "they stay on this device" is no longer true.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Found on the demo stand: text typed less than a second ago has no draft
  // yet, so signing out did not ask, ended the session and then got stuck on the guard of the form.
  it("asks before signing out also when the text was typed just now", async () => {
    const calls = stubApi({ "GET /me": () => json(ADA), "POST /auth/logout": () => noContent() });
    const { router } = renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const dialog = await screen.findByRole("dialog", { name: "Sign out and delete unsaved changes?" });
    expect(calls.some((c) => c.path === "/auth/logout")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Sign out anyway" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    await waitFor(async () => {
      expect(await loadDraft(ADA.id, "profile")).toBeNull();
    });
  });

  // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Wiped drafts stay wiped only until the next session in this tab.
  it("keeps what is typed again after signing in again", async () => {
    stubApi({ "GET /me": () => json(ADA) });
    await wipeDrafts(ADA.id);
    renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "!");
    await waitFor(
      async () => {
        expect((await loadDraft(ADA.id, "profile"))?.fields.display_name).toBe("Ada Admin!");
      },
      { timeout: DRAFT_DELAY_MS + 5_000 },
    );
  });
});
