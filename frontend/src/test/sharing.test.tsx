// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Share dialog (share by e-mail, errors, change permission, remove)
// and the Settings overview (shared by me / with me, leave).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Share } from "@/api/generated/types.gen";
import { ShareDialog } from "@/components/sharing/ShareDialog";

import { type Call, json, me, noContent, problem, renderApp, renderWithProviders, stubApi } from "./fake-api";

const CALENDAR = "0199f000-0000-7000-8000-0000000000c1";

function share(overrides: Partial<Share>): Share {
  return {
    id: "0199f000-0000-7000-8000-0000000000s1",
    container_kind: "calendar",
    container_id: CALENDAR,
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

function openDialog() {
  renderWithProviders(
    <ShareDialog open onClose={vi.fn()} containerKind="calendar" containerId={CALENDAR} containerName="Family" />,
  );
}

describe("share dialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares by e-mail and lists the person", async () => {
    const shares: Share[] = [];
    const calls = stubApi({
      "GET /shares": () => json({ data: shares }),
      "POST /shares": (call: Call) => {
        const body = call.body as { grantee_email: string; permission: "view" | "edit" };
        shares.push(share({ grantee_email: body.grantee_email, permission: body.permission }));
        return json(shares[0], 201);
      },
    });
    openDialog();
    expect(await screen.findByRole("dialog", { name: "Share “Family”" })).toBeInTheDocument();
    expect(await screen.findByText("Only you have access.")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "bob@example.org");
    await user.selectOptions(screen.getByLabelText("Permission"), "edit");
    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByText("Shared with bob@example.org.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      container_kind: "calendar",
      container_id: CALENDAR,
      grantee_email: "bob@example.org",
      permission: "edit",
    });
    expect(calls.find((c) => c.path.startsWith("/shares?"))?.path).toContain(`container_id=${CALENDAR}`);
    expect(await screen.findByText("Bob Builder")).toBeInTheDocument();
  });

  it.each([
    [
      problem(422, "validation_failed", {
        errors: [{ pointer: "/grantee_email", detail: "x", code: "user_not_found" }],
      }),
      "There is no user with this e-mail address on this instance.",
    ],
    [
      problem(422, "validation_failed", { errors: [{ pointer: "/grantee_email", detail: "x", code: "self" }] }),
      "You already own this.",
    ],
    [problem(409, "duplicate"), "This person already has access — change the permission below."],
  ])("maps refusals onto the e-mail field (%#)", async (response, text) => {
    stubApi({ "POST /shares": () => response.clone() });
    openDialog();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "someone@example.org");
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
  });

  it("changes the permission with If-Match and removes access after confirmation", async () => {
    let current = [share({ version: 3 })];
    const calls = stubApi({
      "GET /shares": () => json({ data: current }),
      "PATCH /shares/*": () => {
        current = [share({ permission: "edit", version: 4 })];
        return json(current[0]);
      },
      "DELETE /shares/*": () => {
        current = [];
        return noContent();
      },
    });
    openDialog();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Permission for Bob Builder"), "edit");
    await waitFor(() => {
      expect(calls.find((c) => c.method === "PATCH")?.headers.get("If-Match")).toBe('"3"');
    });
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ permission: "edit" });
    // +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Permission changes and removals report their result.
    expect(await screen.findByText("Permission changed to “Can edit”.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove: Bob Builder" }));
    await user.click(
      within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Remove access" }),
    );
    expect(await screen.findByText("Only you have access.")).toBeInTheDocument();
    expect(screen.getByText("Access removed.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});

describe("sharing overview in settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists shares by me and with me, and leaves a shared calendar", async () => {
    let received = [
      share({
        id: "0199f000-0000-7000-8000-0000000000s2",
        container_name: "Team",
        owner_name: "Cid Owner",
        permission: "edit",
      }),
    ];
    const calls = stubApi({
      "GET /me": () => json(me()),
      "GET /shares": (call: Call) => json({ data: call.path.includes("direction=received") ? received : [share({})] }),
      "DELETE /shares/*": () => {
        received = [];
        return noContent();
      },
    });
    renderApp("/settings");
    expect(await screen.findByRole("heading", { name: "Sharing" })).toBeInTheDocument();
    expect(await screen.findByText("Bob Builder")).toBeInTheDocument();
    expect(screen.getByText("Calendar · Family")).toBeInTheDocument();
    expect(await screen.findByText("Calendar from Cid Owner")).toBeInTheDocument();
    const receivedRow = screen.getByText("Team").closest("li") as HTMLElement;
    expect(within(receivedRow).getByText("Can edit")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Leave: Team" }));
    await user.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Leave" }));
    expect(await screen.findByText("Nothing has been shared with you yet.")).toBeInTheDocument();
    expect(screen.getByText("You left “Team”.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/shares/0199f000-0000-7000-8000-0000000000s2");
  });
});
