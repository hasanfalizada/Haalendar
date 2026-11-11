// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F7). Shared notes (FR-ACC-10, D-30): the owner shares a
// note from its editor; a note shared with the user shows under "Shared with me" with its right, without the owner's
// pin, archive and delete; with "can view" its content is read-only (colour too) and the bar cannot delete it; the
// grantee can leave it.
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BEN = "0199f000-0000-7000-8000-0000000000be";
const MINE = "0199f000-0000-7000-8000-0000000000a1";
const TRIP = "0199f000-0000-7000-8000-0000000000a2";
const SHARE = "0199f000-0000-7000-8000-0000000000s1";

const note = (id: string, title: string, owner: string) => ({
  id,
  kind: "note",
  owner_id: owner,
  container_kind: "note",
  container_id: id,
  title,
  body: "",
  color: "brown",
  priority: "medium",
  pinned: owner !== USER, // the owner's pin does not make it pinned for the grantee
  archived_at: null,
  position: "M",
  deleted_at: null,
  version: 2,
});

const share = (permission: "view" | "edit") => ({
  id: SHARE,
  container_kind: "note",
  container_id: TRIP,
  container_name: "Trip",
  grantee_id: USER,
  grantee_name: "Ada Admin",
  grantee_email: "admin@example.org",
  owner_id: BEN,
  owner_name: "Ben",
  permission,
  granted_by: BEN,
  created_at: "2026-11-07T08:00:00Z",
  revoked_at: null,
  version: 1,
});

async function open(permission: "view" | "edit", mineVersion = 2) {
  const db = await localDb(USER);
  await db.items.bulkPut([{ ...note(MINE, "Shopping", USER), version: mineVersion }, note(TRIP, "Trip", BEN)]);
  // The local share row (what pull brings): no display names.
  const row = Object.fromEntries(
    Object.entries(share(permission)).filter(
      ([name]) => !["container_name", "grantee_name", "grantee_email", "owner_name"].includes(name),
    ),
  );
  await db.shares.put(row);
  const calls = stubApi({
    "GET /me": () => json(me()),
    "POST /sync/push": noPush,
    // The note's received share (the owner's own list is empty here).
    "GET /shares": () => json({ data: [share(permission)] }),
    "DELETE /shares/*": () => new Response(null, { status: 204 }),
  });
  renderApp("/todo");
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), calls };
}

describe("shared notes", () => {
  it("the owner shares a note from its editor, once the server has it", async () => {
    const waiting = await open("view", 0);
    await waiting.user.click(await screen.findByRole("button", { name: "Open Shopping" }));
    expect(screen.getByRole("button", { name: "Share…" })).toBeDisabled();
    cleanup();
    const { user } = await open("view");
    await user.click(await screen.findByRole("button", { name: "Open Shopping" }));
    await user.click(screen.getByRole("button", { name: "Share…" }));
    expect(await screen.findByRole("dialog", { name: "Share “Shopping”" })).toBeInTheDocument();
  });

  it("a note shared to view: its own section, no owner actions, read-only content, not deleted in bulk", async () => {
    const { user, calls } = await open("view");
    const shared = await screen.findByRole("region", { name: "Shared with me" });
    const card = within(shared).getByRole("article", { name: "Trip" });
    expect(within(card).getByText("Shared · can view")).toBeInTheDocument();
    for (const name of ["Pin Trip", "Archive Trip", "Delete Trip", "Color of Trip"]) {
      expect(within(card).queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument();

    await user.click(within(card).getByRole("checkbox", { name: "Select Trip" }));
    const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(within(bar).queryByRole("button", { name: "Delete selected" })).not.toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Color" })).not.toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Open Trip" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    expect(await within(editor).findByText("Shared by Ben · you can view it")).toBeInTheDocument();
    expect(within(editor).getByLabelText("Title")).toBeDisabled();
    expect(within(editor).queryByRole("button", { name: "Share…" })).not.toBeInTheDocument();
    await user.click(within(editor).getByRole("button", { name: "Leave" }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === "DELETE" && c.path === `/shares/${SHARE}`)).toBe(true);
    });
  });

  it("a note shared to edit: content and colour editable, still no pin, archive or delete", async () => {
    const { user } = await open("edit");
    const card = within(await screen.findByRole("region", { name: "Shared with me" })).getByRole("article", {
      name: "Trip",
    });
    expect(within(card).getByText("Shared · can edit")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Color of Trip" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Delete Trip" })).not.toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Open Trip" }));
    const editor = await screen.findByRole("dialog", { name: "Edit note" });
    expect(within(editor).getByLabelText("Title")).toBeEnabled();
  });
});
