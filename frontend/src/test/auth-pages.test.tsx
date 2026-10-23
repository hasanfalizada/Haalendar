// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Session gate, sign-in (incl. TOTP step), mandatory password change,
// invitation page and sign-out.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { safeRedirect } from "@/api/session";

import { json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

const PASSPHRASE = "correct horse battery staple";

describe("session gate and sign-in", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a signed-out visitor to /login and back to the requested page afterwards", async () => {
    const calls = stubApi({
      "GET /me": () => problem(401, "session_expired"),
      "POST /auth/login": () => json({ me: me({ role: "user" }), csrf_token: "csrf-login" }),
      "POST /auth/logout": noContent,
    });
    const { router } = renderApp("/kanban");
    expect(await screen.findByRole("heading", { name: "Sign in to Haalendar" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "ada@example.org");
    await user.type(screen.getByLabelText("Password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Kanban", level: 1 })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/auth/login")?.body).toEqual({
      email: "ada@example.org",
      password: PASSPHRASE,
    });
    // Regular users do not see the admin panel.
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });

  it("asks for the authenticator code when the account has 2FA", async () => {
    const calls = stubApi({
      "GET /me": () => problem(401, "session_expired"),
      "POST /auth/login": (call) =>
        (call.body as { totp_code?: string }).totp_code === "123456"
          ? json({ me: me(), csrf_token: "csrf-2fa" })
          : problem(401, "totp_required"),
    });
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "ada@example.org");
    await user.type(screen.getByLabelText("Password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await user.type(await screen.findByLabelText("Code from your authenticator app"), "12a3456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: /^Calendar:/, level: 1 })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/auth/login").at(-1)?.body).toMatchObject({ totp_code: "123456" });
  });

  it("shows a generic message for wrong credentials", async () => {
    stubApi({
      "GET /me": () => problem(401, "session_expired"),
      "POST /auth/login": () => problem(401, "invalid_credentials"),
    });
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "ada@example.org");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail or password is incorrect.");
  });

  it("accepts only same-origin paths as redirect targets", () => {
    expect(safeRedirect("/todo")).toBe("/todo");
    expect(safeRedirect("//evil.example")).toBe("/calendar");
    expect(safeRedirect("https://evil.example")).toBe("/calendar");
    expect(safeRedirect(undefined)).toBe("/calendar");
  });
});

describe("one-time password and sign-out", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces a new password before anything else", async () => {
    let changed = false;
    const calls = stubApi({
      "GET /me": () => json(me({ must_change_password: !changed })),
      "POST /me/password": () => {
        changed = true;
        return noContent();
      },
    });
    const { router } = renderApp("/calendar");
    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/change-password");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getAllByText("Use at least 15 characters").length).toBeGreaterThan(0);
    expect(calls.some((c) => c.path === "/me/password")).toBe(false);

    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("heading", { name: /^Calendar:/, level: 1 })).toBeInTheDocument();
    const sent = calls.find((c) => c.path === "/me/password");
    expect(sent?.body).toEqual({ new_password: PASSPHRASE });
    expect(sent?.headers.get("X-CSRF-Token")).toBe("csrf-1");
  });

  it("signs out from the settings page", async () => {
    let signedIn = true;
    const calls = stubApi({
      "GET /me": () => (signedIn ? json(me()) : problem(401, "session_expired")),
      "POST /auth/logout": () => {
        signedIn = false;
        return noContent();
      },
    });
    const { router } = renderApp("/settings");
    expect(await screen.findByText("Signed in as admin@example.org")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(calls.some((c) => c.path === "/auth/logout")).toBe(true);
  });
});

describe("invitation page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the account from the invitation and signs in", async () => {
    let registered = false;
    const calls = stubApi({
      "POST /auth/invite-info": () => json({ email: "ivy@example.org", expires_at: "2026-10-22T10:00:00Z" }),
      "POST /auth/register": () => {
        registered = true;
        return new Response(null, { status: 202 });
      },
      "POST /auth/login": () => json({ me: me({ email: "ivy@example.org", role: "user" }), csrf_token: "c" }),
      "GET /me": () => (registered ? json(me({ role: "user" })) : problem(401, "session_expired")),
    });
    renderApp("/invite?token=tok123");
    expect(await screen.findByDisplayValue("ivy@example.org")).toHaveAttribute("readonly");
    expect(calls.find((c) => c.path === "/auth/invite-info")?.body).toEqual({ token: "tok123" });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your name"), "Ivy");
    await user.type(screen.getByLabelText("Password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: /^Calendar:/, level: 1 })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/auth/register")?.body).toMatchObject({
      email: "ivy@example.org",
      display_name: "Ivy",
      invite_token: "tok123",
    });
  });

  it("explains an invalid or expired invitation", async () => {
    stubApi({ "POST /auth/invite-info": () => problem(400, "bad_request") });
    renderApp("/invite?token=old");
    expect(await screen.findByRole("heading", { name: "Invitation not valid" })).toBeInTheDocument();
  });
});
