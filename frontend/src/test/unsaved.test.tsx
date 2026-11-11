// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. Unsaved-changes guard (FR-X-09): route change and module switch ask
// (keep editing / leave with the draft / discard), nothing is asked without changes or after saving, dialog editors
// ask on Esc and Cancel, the tab-close prompt follows unsaved changes, Ctrl+Enter saves the focused editor.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminInvite, AdminUser } from "@/api/generated/types.gen";
import { loadDraft } from "@/lib/drafts";

import { type Call, json, me, renderApp, stubApi } from "./fake-api";

const ADA = me({ display_name: "Ada Admin" });

function profileServer() {
  let current = ADA;
  return stubApi({
    "GET /me": () => json(current),
    "PATCH /me": (call: Call) => {
      current = { ...current, ...(call.body as object), version: current.version + 1 };
      return json(current);
    },
  });
}

async function typeName(user: ReturnType<typeof userEvent.setup>, extra: string) {
  await user.type(await screen.findByLabelText("Display name"), extra);
}

function unload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("unsaved changes on a page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks before leaving: keep editing, then discard", async () => {
    profileServer();
    const { router } = renderApp("/settings");
    const user = userEvent.setup();
    await typeName(user, " Lovelace");
    expect(unload()).toBe(true);

    await user.click(screen.getAllByRole("link", { name: "Calendar" })[0] as HTMLElement);
    let dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(within(dialog).getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/settings");
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Admin Lovelace");

    fireEvent.keyDown(document.body, { code: "Digit1", key: "1", altKey: true }); // module switch
    dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/calendar");
    });
    expect(await loadDraft(ADA.id, "profile")).toBeNull();
    expect(unload()).toBe(false);
  });

  it("leaves with the draft kept on the device", async () => {
    profileServer();
    const { router } = renderApp("/settings");
    const user = userEvent.setup();
    await typeName(user, "!");
    await user.click(screen.getAllByRole("link", { name: "Calendar" })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Leave, keep the draft" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/calendar");
    });
    expect((await loadDraft(ADA.id, "profile"))?.fields.display_name).toBe("Ada Admin!");
  });

  it("asks nothing without changes or after saving, and Ctrl+Enter saves", async () => {
    const calls = profileServer();
    const { router } = renderApp("/settings");
    const user = userEvent.setup();
    await typeName(user, "!");
    fireEvent.keyDown(screen.getByLabelText("Display name"), { code: "Enter", key: "Enter", ctrlKey: true });
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ display_name: "Ada Admin!" });

    await user.click(screen.getAllByRole("link", { name: "Calendar" })[0] as HTMLElement);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/calendar");
    });
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });
});

describe("unsaved changes in a dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks on Esc and Cancel when something was typed, closes at once otherwise", async () => {
    const invites: AdminInvite[] = [];
    const users: AdminUser[] = [];
    stubApi({
      "GET /me": () => json(ADA),
      "GET /admin/users": () => json({ data: users, next_cursor: null }),
      "GET /admin/invites": () => json({ data: invites }),
    });
    renderApp("/admin");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("dialog", { name: "Invite a user" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite a user" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Invite" }));
    const invite = await screen.findByRole("dialog", { name: "Invite a user" });
    await user.type(within(invite).getByLabelText("E-mail"), "bob@example.org");
    await user.keyboard("{Escape}");
    let ask = await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(within(invite).getByLabelText("E-mail")).toHaveValue("bob@example.org");

    await user.click(within(invite).getByRole("button", { name: "Cancel" }));
    ask = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(within(ask).queryByRole("button", { name: "Leave, keep the draft" })).not.toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Invite a user" })).not.toBeInTheDocument();
    });
  });
});
