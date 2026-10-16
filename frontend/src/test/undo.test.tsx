// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo in the app (sharing overview in Settings): Undo in the
// notification shares again, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y outside text fields, the browser's own undo inside them,
// a permission change undone with the version of the latest answer.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Share } from "@/api/generated/types.gen";
import { clearUndo } from "@/lib/undo";

import { type Call, json, me, noContent, renderApp, stubApi } from "./fake-api";

function share(overrides: Partial<Share> = {}): Share {
  return {
    id: "0199f000-0000-7000-8000-0000000000s1",
    container_kind: "calendar",
    container_id: "0199f000-0000-7000-8000-0000000000c1",
    container_name: "Family",
    grantee_id: "0199f000-0000-7000-8000-000000000002",
    grantee_name: "Bob Builder",
    grantee_email: "bob@example.org",
    owner_id: "0199f000-0000-7000-8000-000000000001",
    owner_name: "Ada Admin",
    permission: "view",
    granted_by: "0199f000-0000-7000-8000-000000000001",
    created_at: "2026-10-15T09:00:00Z",
    revoked_at: null,
    version: 1,
    ...overrides,
  };
}

function sharingServer() {
  let granted: Share[] = [share()];
  let created = 0;
  const calls = stubApi({
    "GET /me": () => json(me()),
    "GET /shares": (call: Call) => json({ data: call.path.includes("direction=received") ? [] : granted }),
    "DELETE /shares/*": (call: Call) => {
      granted = granted.filter((s) => !call.path.endsWith(s.id));
      return noContent();
    },
    "POST /shares": (call: Call) => {
      created += 1;
      const body = call.body as { permission: "view" | "edit" };
      const again = share({ id: `0199f000-0000-7000-8000-00000000000${String(created)}`, permission: body.permission });
      granted = [again];
      return json(again, 201);
    },
    "PATCH /shares/*": (call: Call) => {
      const current = granted[0] ?? share();
      granted = [
        {
          ...current,
          permission: (call.body as { permission: "view" | "edit" }).permission,
          version: current.version + 1,
        },
      ];
      return json(granted[0]);
    },
  });
  return calls;
}

async function removeBob(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Remove: Bob Builder" }));
  await user.click(
    within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Remove access" }),
  );
  expect(await screen.findByText("Access removed.")).toBeInTheDocument();
}

describe("undo in the app", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares again from the notification's Undo button", async () => {
    const calls = sharingServer();
    renderApp("/settings");
    const user = userEvent.setup();
    await removeBob(user);
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Undone: removing access for Bob Builder.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path === "/shares")?.body).toEqual({
      container_kind: "calendar",
      container_id: "0199f000-0000-7000-8000-0000000000c1",
      grantee_email: "bob@example.org",
      permission: "view",
    });
    expect(await screen.findByRole("button", { name: "Remove: Bob Builder" })).toBeInTheDocument();
  });

  it("undoes with Ctrl+Z and redoes with Ctrl+Shift+Z and Ctrl+Y, but not while typing", async () => {
    const calls = sharingServer();
    renderApp("/settings");
    const user = userEvent.setup();
    await removeBob(user);

    // In a text field Ctrl+Z belongs to the field.
    const name = screen.getByLabelText("Display name");
    fireEvent.keyDown(name, { code: "KeyZ", key: "z", ctrlKey: true });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    fireEvent.keyDown(document.body, { code: "KeyZ", key: "z", ctrlKey: true });
    expect(await screen.findByText("Undone: removing access for Bob Builder.")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true });
    expect(await screen.findByText("Redone: removing access for Bob Builder.")).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(2);
    });
    // The redo removed the re-created share, not the original id.
    expect(calls.filter((c) => c.method === "DELETE")[1]?.path).toBe("/shares/0199f000-0000-7000-8000-000000000001");

    fireEvent.keyDown(document.body, { code: "KeyZ", key: "z", metaKey: true });
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    });
    fireEvent.keyDown(document.body, { code: "KeyY", key: "y", ctrlKey: true });
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(3);
    });
  });

  it("undoes a permission change with the version of the latest answer", async () => {
    const calls = sharingServer();
    renderApp("/settings");
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Permission for Bob Builder"), "edit");
    expect(await screen.findByText("Permission changed to “Can edit”.")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { code: "KeyZ", key: "z", ctrlKey: true });
    expect(await screen.findByText("Undone: the permission change for Bob Builder.")).toBeInTheDocument();
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches[1]?.body).toEqual({ permission: "view" });
    expect(patches[1]?.headers.get("If-Match")).toBe('"2"');
  });
});
