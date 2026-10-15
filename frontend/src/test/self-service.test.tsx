// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Sign-up (open mode), e-mail confirmation and resend, forgot/reset
// password, login links, Settings → Security (password, 2FA, sessions) and admin instance settings.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type Call, json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

const PASSPHRASE = "correct horse battery staple";
const OPEN = () =>
  json({ setup_required: false, setup_token_required: false, registration_mode: "open", demo_mode: false });
const SIGNED_OUT = () => problem(401, "session_expired");

describe("public account pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers in open mode and resends the confirmation link", async () => {
    const calls = stubApi({
      "GET /setup/status": OPEN,
      "GET /me": SIGNED_OUT,
      "POST /auth/register": () => new Response(null, { status: 202 }),
      "POST /auth/verify-email/resend": () => new Response(null, { status: 202 }),
    });
    renderApp("/register");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Your name"), "Nia New");
    await user.type(screen.getByLabelText("E-mail"), "nia@example.org");
    await user.type(screen.getByLabelText("Password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/auth/register")?.body).toMatchObject({
      email: "nia@example.org",
      display_name: "Nia New",
      password: PASSPHRASE,
    });
    await user.click(screen.getByRole("button", { name: "Send the link again" }));
    expect(await screen.findByText(/a new link was sent/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/auth/verify-email/resend")?.body).toEqual({ email: "nia@example.org" });
  });

  it("explains that sign-up is by invitation when the instance is not open", async () => {
    stubApi({ "GET /me": SIGNED_OUT });
    renderApp("/register");
    expect(await screen.findByRole("heading", { name: "Registration by invitation" })).toBeInTheDocument();
  });

  it("shows forgot-password and sign-up links and offers a new link for an unconfirmed e-mail", async () => {
    stubApi({
      "GET /setup/status": OPEN,
      "GET /me": SIGNED_OUT,
      "POST /auth/login": () => problem(403, "email_not_verified"),
    });
    renderApp("/login");
    expect(await screen.findByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    expect(await screen.findByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "nia@example.org");
    await user.type(screen.getByLabelText("Password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: "Send the link again" })).toBeInTheDocument();
  });

  it("confirms the e-mail from the link exactly once", async () => {
    const calls = stubApi({ "GET /me": SIGNED_OUT, "POST /auth/verify-email": noContent });
    renderApp("/verify-email?token=abc");
    expect(await screen.findByRole("heading", { name: "E-mail confirmed" })).toBeInTheDocument();
    const sent = calls.filter((c) => c.path === "/auth/verify-email");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({ token: "abc" });
  });

  it("offers a new confirmation link for an expired one", async () => {
    const calls = stubApi({
      "GET /me": SIGNED_OUT,
      "POST /auth/verify-email": () => problem(400, "bad_request"),
      "POST /auth/verify-email/resend": () => new Response(null, { status: 202 }),
    });
    renderApp("/verify-email?token=old");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "nia@example.org");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Send the link again" }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === "/auth/verify-email/resend")).toBe(true);
    });
  });

  it("requests a reset link and sets a new password", async () => {
    const calls = stubApi({
      "GET /me": SIGNED_OUT,
      "POST /auth/password-reset/request": () => new Response(null, { status: 202 }),
      "POST /auth/password-reset/confirm": noContent,
    });
    renderApp("/forgot-password");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("E-mail"), "nia@example.org");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/auth/password-reset/request")?.body).toEqual({ email: "nia@example.org" });
  });

  it("saves a new password from the reset link", async () => {
    const calls = stubApi({ "GET /me": SIGNED_OUT, "POST /auth/password-reset/confirm": noContent });
    renderApp("/reset-password?token=tok");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("New password"), PASSPHRASE);
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/auth/password-reset/confirm")?.body).toEqual({
      token: "tok",
      new_password: PASSPHRASE,
    });
  });
});

describe("settings → security", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes the password after re-authentication", async () => {
    let reauthed = false;
    const calls = stubApi({
      "GET /me": () => json(me()),
      "POST /me/password": () => (reauthed ? noContent() : problem(403, "reauth_required")),
      "POST /auth/reauth": () => {
        reauthed = true;
        return noContent();
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("form", { name: "Change password" });
    await user.type(within(section).getByLabelText("New password"), PASSPHRASE);
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    const reauth = await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.type(within(reauth).getByLabelText("Password"), "my-current-password");
    await user.click(within(reauth).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Password changed. Other devices were signed out.")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/me/password")).toHaveLength(2);
  });

  it("sets up 2FA with a QR code and shows the recovery codes once", async () => {
    let enabled = false;
    const codes = Array.from({ length: 10 }, (_, i) => `abcd-ef${String(i).padStart(2, "0")}`);
    const calls = stubApi({
      "GET /me": () => json(me({ totp_enabled: enabled })),
      "POST /me/totp/setup": () =>
        json({
          otpauth_uri: "otpauth://totp/Haalendar:ada%40example.org?secret=JBSWY3DPEHPK3PXP",
          secret: "JBSWY3DPEHPK3PXP",
        }),
      "POST /me/totp/enable": (call: Call) => {
        if ((call.body as { totp_code: string }).totp_code !== "123456") return problem(422, "validation_failed");
        enabled = true;
        return json({ recovery_codes: codes });
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Set up" }));
    expect(await screen.findByRole("img", { name: "QR code for your authenticator app" })).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Code from your authenticator app"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/The code is incorrect/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Code from your authenticator app"));
    await user.type(screen.getByLabelText("Code from your authenticator app"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    const dialog = await screen.findByRole("dialog", { name: "Recovery codes" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(10);
    await user.click(within(dialog).getByRole("button", { name: "I saved them" }));
    expect(await screen.findByText(/On — signing in needs a code/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/me/totp/enable")).toHaveLength(2);
  });

  it("regenerates recovery codes and turns 2FA off after confirmation", async () => {
    let enabled = true;
    const calls = stubApi({
      "GET /me": () => json(me({ totp_enabled: enabled })),
      "POST /me/totp/recovery-codes": () =>
        json({ recovery_codes: Array.from({ length: 10 }, (_, i) => `new-${String(i)}`) }),
      "POST /me/totp/disable": () => {
        enabled = false;
        return noContent();
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New recovery codes" }));
    const dialog = await screen.findByRole("dialog", { name: "Recovery codes" });
    expect(within(dialog).getByText("new-0")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "I saved them" }));

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await user.click(screen.getByRole("button", { name: "Turn off 2FA" }));
    expect(await screen.findByText("Two-factor authentication is off.")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/me/totp/disable")).toBe(true);
  });

  it("lists devices and signs out others", async () => {
    let sessions = [
      {
        id: "s-1",
        created_at: "2026-10-01T08:00:00Z",
        last_seen_at: "2026-10-15T08:00:00Z",
        device: "Firefox on Linux",
        ip_prefix: "10.0.0.0/24",
        current: true,
      },
      {
        id: "s-2",
        created_at: "2026-10-02T08:00:00Z",
        last_seen_at: "2026-10-14T08:00:00Z",
        device: "Chrome on Android",
        ip_prefix: "10.0.1.0/24",
        current: false,
      },
      {
        id: "s-3",
        created_at: "2026-10-03T08:00:00Z",
        last_seen_at: "2026-10-13T08:00:00Z",
        device: "Safari on iOS",
        ip_prefix: null,
        current: false,
      },
    ];
    const calls = stubApi({
      "GET /me": () => json(me()),
      "GET /me/sessions": () => json({ data: sessions }),
      "DELETE /me/sessions/*": (call: Call) => {
        sessions = sessions.filter((s) => !call.path.endsWith(s.id));
        return noContent();
      },
      "POST /me/sessions/revoke-others": () => {
        sessions = sessions.filter((s) => s.current);
        return noContent();
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    expect(await screen.findByText("This device")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign out Chrome on Android" }));
    expect(await screen.findByText("The device was signed out.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/me/sessions/s-2");

    await user.click(screen.getByRole("button", { name: "Sign out all other devices" }));
    expect(await screen.findByText("All other devices were signed out.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Safari on iOS")).not.toBeInTheDocument();
    });
  });
});

describe("admin instance settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens sign-up with If-Match and explains the 2FA self-lock-out guard", async () => {
    let version = 3;
    let mode = "invite";
    const calls = stubApi({
      "GET /me": () => json(me()),
      "GET /admin/users": () => json({ data: [], next_cursor: null }),
      "GET /admin/invites": () => json({ data: [] }),
      "GET /admin/settings": () =>
        json({ registration_mode: mode, require_admin_2fa: false, demo_mode: false, smtp_configured: true, version }),
      "PATCH /admin/settings": (call: Call) => {
        if ((call.body as { require_admin_2fa?: boolean }).require_admin_2fa) return problem(409, "invalid_state");
        version += 1;
        mode = "open";
        return json({
          registration_mode: mode,
          require_admin_2fa: false,
          demo_mode: false,
          smtp_configured: true,
          version,
        });
      },
    });
    renderApp("/admin");
    const user = userEvent.setup();
    expect(await screen.findByText("E-mail sending is configured.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("New accounts"), "open");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Instance settings saved.")).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.headers.get("If-Match")).toBe('"3"');
    expect(patch?.body).toEqual({ registration_mode: "open" });

    await user.click(await screen.findByLabelText("Administrators must use 2FA"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Turn on two-factor authentication for your own account first/)).toBeInTheDocument();
  });
});
