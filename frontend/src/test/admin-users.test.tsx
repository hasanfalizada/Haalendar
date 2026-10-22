// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel: access, list, own row protection, deactivate with
// re-authentication, one-time password reset, role change with If-Match, invitations and revoke.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminInvite, AdminUser } from "@/api/generated/types.gen";

import { type Call, json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

const ADMIN = me();

function adminUser(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: ADMIN.id,
    email: ADMIN.email,
    display_name: ADMIN.display_name,
    role: "admin",
    status: "active",
    totp_enabled: false,
    last_login_at: "2026-10-15T08:00:00Z",
    created_at: "2026-10-01T08:00:00Z",
    version: 1,
    ...overrides,
  };
}

const BOB = adminUser({
  id: "0199f000-0000-7000-8000-000000000002",
  email: "bob@example.org",
  display_name: "Bob Builder",
  role: "user",
  last_login_at: null,
  version: 3,
});

function adminRoutes(extra: Record<string, (call: Call) => Response> = {}, users: AdminUser[] = [adminUser({}), BOB]) {
  const invites: AdminInvite[] = [];
  return {
    invites,
    routes: {
      "GET /me": () => json(ADMIN),
      "GET /admin/users": () => json({ data: users, next_cursor: null }),
      "GET /admin/invites": () => json({ data: invites }),
      ...extra,
    },
  };
}

async function openActions(name: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
  return user;
}

// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. These cases type whole forms with user-event, which takes close to
// the default 5 s in jsdom on WSL drives (and more under machine load): a longer budget, not a weaker test.
describe("admin panel", { timeout: 15_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is not reachable for regular users", async () => {
    stubApi({ "GET /me": () => json(me({ role: "user" })) });
    const { router } = renderApp("/admin");
    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/calendar");
  });

  it("lists users; the own row has no actions", async () => {
    stubApi(adminRoutes().routes);
    renderApp("/admin");
    expect(await screen.findByRole("heading", { name: "Users", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("Bob Builder")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Bob Builder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for Ada Admin" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Users" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("deactivates after confirmation and re-authentication", async () => {
    let reauthed = false;
    const calls = stubApi(
      adminRoutes({
        "POST /admin/users/*/deactivate": () =>
          reauthed ? json({ user: { ...BOB, status: "deactivated" } }) : problem(403, "reauth_required"),
        "POST /auth/reauth": () => {
          reauthed = true;
          return noContent();
        },
      }).routes,
    );
    renderApp("/admin");
    const user = await openActions("Bob Builder");
    await user.click(await screen.findByRole("menuitem", { name: "Deactivate" }));
    const confirm = await screen.findByRole("dialog", { name: "Deactivate Bob Builder?" });
    await user.click(within(confirm).getByRole("button", { name: "Deactivate" }));

    const reauth = await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.type(within(reauth).getByLabelText("Password"), "my-own-password-123");
    await user.click(within(reauth).getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Bob Builder was deactivated and signed out. Their data is kept."),
    ).toBeInTheDocument();
    const actions = calls.filter((c) => c.path.endsWith("/deactivate"));
    expect(actions).toHaveLength(2); // refused once, retried after re-auth
    expect(actions[1]?.headers.get("X-CSRF-Token")).toBe("csrf-1");
    expect(calls.find((c) => c.path === "/auth/reauth")?.body).toEqual({ password: "my-own-password-123" });
  });

  it("shows a one-time password exactly once after a reset without SMTP", async () => {
    stubApi(
      adminRoutes({
        "POST /admin/users/*/reset-password": () =>
          json({ user: BOB, delivery: "one_time_password", one_time_password: "otp-very-secret-1" }),
      }).routes,
    );
    renderApp("/admin");
    const user = await openActions("Bob Builder");
    await user.click(await screen.findByRole("menuitem", { name: "Reset password" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Reset the password of Bob Builder?" })).getByRole("button", {
        name: "Reset password",
      }),
    );
    const shown = await screen.findByRole("dialog", { name: "One-time password" });
    expect(within(shown).getByLabelText("One-time password")).toHaveValue("otp-very-secret-1");
    await user.click(within(shown).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("otp-very-secret-1")).not.toBeInTheDocument();
    });
  });

  it("changes the role with the row version in If-Match", async () => {
    const calls = stubApi(
      adminRoutes({ "PATCH /admin/users/*": () => json({ ...BOB, role: "admin", version: 4 }) }).routes,
    );
    renderApp("/admin");
    const user = await openActions("Bob Builder");
    await user.click(await screen.findByRole("menuitem", { name: "Make administrator" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Change the role of Bob Builder?" })).getByRole("button", {
        name: "Make administrator",
      }),
    );
    expect(await screen.findByText("Bob Builder is now: Administrator.")).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.headers.get("If-Match")).toBe('"3"');
    expect(patch?.headers.get("Content-Type")).toBe("application/merge-patch+json");
    expect(patch?.body).toEqual({ role: "admin" });
  });

  it("explains the last-admin protection", async () => {
    stubApi(adminRoutes({ "PATCH /admin/users/*": () => problem(409, "invalid_state") }).routes);
    renderApp("/admin");
    const user = await openActions("Bob Builder");
    await user.click(await screen.findByRole("menuitem", { name: "Make administrator" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Change the role of Bob Builder?" })).getByRole("button", {
        name: "Make administrator",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("at least one active administrator must remain");
  });

  it("sends an invitation and revokes it", async () => {
    const setup = adminRoutes();
    const calls = stubApi({
      ...setup.routes,
      "POST /admin/invites": (call) => {
        const invite: AdminInvite = {
          id: "0199f000-0000-7000-8000-0000000000aa",
          email: (call.body as { email: string }).email,
          role: "user",
          created_at: "2026-10-15T09:00:00Z",
          expires_at: "2026-10-22T09:00:00Z",
        };
        setup.invites.push(invite);
        return json({ delivery: "email", invite }, 201);
      },
      "DELETE /admin/invites/*": () => {
        setup.invites.length = 0;
        return noContent();
      },
    });
    renderApp("/admin");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    await user.type(within(dialog).getByLabelText("E-mail"), "new@example.org");
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("An invitation was sent to new@example.org.")).toBeInTheDocument();
    const sent = calls.find((c) => c.method === "POST" && c.path === "/admin/invites");
    expect(sent?.body).toEqual({ email: "new@example.org", role: "user" });
    expect(sent?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);

    await user.click(await screen.findByRole("button", { name: "Revoke the invitation for new@example.org" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Revoke this invitation?" })).getByRole("button", {
        name: "Revoke",
      }),
    );
    expect(await screen.findByText("The invitation for new@example.org was revoked.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Pending invitations")).not.toBeInTheDocument();
    });
  });

  it("maps a duplicate invitation onto the e-mail field", async () => {
    stubApi(adminRoutes({ "POST /admin/invites": () => problem(409, "duplicate") }).routes);
    renderApp("/admin");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Invite" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
    await user.type(within(dialog).getByLabelText("E-mail"), "bob@example.org");
    await user.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await within(dialog).findByText("An account with this e-mail already exists.")).toBeInTheDocument();
  });
});
