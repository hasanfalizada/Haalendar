// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. First-run wizard: setup gate redirects, live password hints, token
// field, server problem mapping, success → signed in and redirected to the calendar.
import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { CSRF_HEADER } from "@/api/client";
import { logout } from "@/api/generated/sdk.gen";
import { createAppRouter, createQueryClient } from "@/router";

interface Status {
  setup_required: boolean;
  setup_token_required: boolean;
}

const ME = {
  id: "0199f000-0000-7000-8000-000000000001",
  email: "admin@example.org",
  display_name: "Ada Admin",
  role: "admin",
  time_zone: "Europe/Berlin",
  locale: "en",
  totp_enabled: false,
  version: 1,
  csrf_token: "csrf-from-setup",
};

const json = (body: unknown, status = 200, type = "application/json") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });

/** Fake backend: setup status, setup admin (answer configurable), health for the connection indicator. */
function stubBackend(status: Status, adminResponse: () => Response = () => json(ME, 201)) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/api/v1/setup/status") return json({ ...status, registration_mode: "invite", demo_mode: false });
      if (path === "/api/v1/setup/admin") {
        status.setup_required = false;
        return adminResponse();
      }
      return json({ status: "ok", version: "0.1.0" });
    }),
  );
  return requests;
}

function renderApp(initialPath: string) {
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [initialPath] }));
  render(<App queryClient={queryClient} router={router} />);
  return { router };
}

async function fillForm(password = "correct horse battery staple") {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Your name"), "Ada Admin");
  await user.type(screen.getByLabelText("E-mail"), "admin@example.org");
  await user.type(screen.getByLabelText("Password"), password);
  return user;
}

// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. These cases type whole forms with user-event, which takes close to
// the default 5 s in jsdom on WSL drives (and more under machine load): a longer budget, not a weaker test.
describe("first-run setup wizard", { timeout: 15_000 }, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects every page to /setup while no administrator exists", async () => {
    stubBackend({ setup_required: true, setup_token_required: false });
    const { router } = renderApp("/kanban");
    expect(await screen.findByRole("heading", { name: "Welcome to Haalendar", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/setup");
    expect(screen.queryByLabelText("Setup token")).not.toBeInTheDocument();
  });

  it("sends /setup to the calendar once setup is complete", async () => {
    stubBackend({ setup_required: false, setup_token_required: false });
    const { router } = renderApp("/setup");
    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/calendar");
  });

  it("shows live password hints from the shared policy and blocks a weak password", async () => {
    const requests = stubBackend({ setup_required: true, setup_token_required: false });
    renderApp("/setup");
    const user = await fillForm("ada admin");
    expect(screen.getByText("Use at least 15 characters")).toBeInTheDocument();
    expect(screen.getByText("Do not include your name")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 15 characters");
    expect(requests.some((r) => r.url.endsWith("/setup/admin"))).toBe(false);
  });

  it("creates the administrator, keeps the CSRF token and opens the calendar", async () => {
    const requests = stubBackend({ setup_required: true, setup_token_required: true });
    const { router } = renderApp("/setup");
    const user = await fillForm();
    await user.type(await screen.findByLabelText("Setup token"), "token-from-env");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));

    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/calendar");
    const sent = requests.find((r) => r.url.endsWith("/setup/admin"));
    expect(sent?.method).toBe("POST");
    const body = (await sent?.clone().json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      display_name: "Ada Admin",
      email: "admin@example.org",
      setup_token: "token-from-env",
    });
    expect(typeof body.time_zone).toBe("string");

    await logout();
    // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-061. The logout request itself, not simply the last one: the sync
    // engine of the calendar page may send a pull at the same moment.
    const logoutRequest = requests.filter((r) => r.url.endsWith("/auth/logout")).at(-1);
    expect(logoutRequest?.headers.get(CSRF_HEADER)).toBe("csrf-from-setup");
  });

  it("maps a rejected setup token onto the token field", async () => {
    stubBackend({ setup_required: true, setup_token_required: true }, () =>
      json(
        { type: "about:blank", title: "Forbidden", status: 403, code: "forbidden" },
        403,
        "application/problem+json",
      ),
    );
    renderApp("/setup");
    const user = await fillForm();
    await user.type(await screen.findByLabelText("Setup token"), "wrong");
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    expect(await screen.findByText("The setup token is missing or invalid.")).toBeInTheDocument();
    expect(screen.getByLabelText("Setup token")).toHaveAttribute("aria-invalid", "true");
  });

  it("maps server field errors (422) onto the form", async () => {
    stubBackend({ setup_required: true, setup_token_required: false }, () =>
      json(
        {
          type: "about:blank",
          title: "Validation failed",
          status: 422,
          code: "validation_failed",
          errors: [
            { pointer: "/time_zone", detail: "Use an IANA time zone, e.g. Europe/Berlin" },
            { pointer: "/password", detail: "common", code: "common" },
          ],
        },
        422,
        "application/problem+json",
      ),
    );
    renderApp("/setup");
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    expect(await screen.findByText("Use an IANA time zone, e.g. Europe/Berlin")).toBeInTheDocument();
    expect(screen.getByText("This password is too common")).toBeInTheDocument();
  });

  it("explains a conflict when setup was completed meanwhile", async () => {
    stubBackend({ setup_required: true, setup_token_required: false }, () =>
      json(
        { type: "about:blank", title: "Conflict", status: 409, code: "invalid_state" },
        409,
        "application/problem+json",
      ),
    );
    renderApp("/setup");
    const user = await fillForm();
    await user.click(screen.getByRole("button", { name: "Create administrator" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Setup has already been completed.");
    });
  });
});
