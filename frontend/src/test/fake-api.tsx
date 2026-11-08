// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Fake backend for page tests: routes like "POST /admin/users/*/deactivate"
// map to handlers; every request is recorded (method, path, JSON body, headers) for assertions.
import { createMemoryHistory } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { onTestFinished, vi } from "vitest";

import "@/i18n";
import { App } from "@/App";
import type { Me, Settings } from "@/api/generated/types.gen";
import { Notifications } from "@/components/ui/notifications";
import { createAppRouter, createQueryClient } from "@/router";
import { SyncEngine } from "@/sync/engine";
import { ThemeProvider } from "@/theme/ThemeProvider";

export interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });

export const problem = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json({ type: "about:blank", title: code, status, code, ...extra }, status);

export const noContent = () => new Response(null, { status: 204 });

export function me(overrides: Partial<Me> = {}): Me {
  return {
    id: "0199f000-0000-7000-8000-000000000001",
    email: "admin@example.org",
    display_name: "Ada Admin",
    role: "admin",
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, // = device zone: no mismatch notice by default
    locale: "en",
    totp_enabled: false,
    must_change_password: false,
    csrf_token: "csrf-1",
    version: 1,
    ...overrides,
  };
}

const DEFAULTS: Record<string, Handler> = {
  "GET /setup/status": () =>
    json({ setup_required: false, setup_token_required: false, registration_mode: "invite", demo_mode: false }),
  "GET /health/live": () => json({ status: "ok", version: "0.1.0" }),
  "GET /health/ready": () => json({ status: "ok", version: "0.1.0" }),
  "GET /shares": () => json({ data: [] }),
  "GET /me/sessions": () => json({ data: [] }),
  "GET /exports": () => json({ data: [] }),
  // +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The signed-in user's settings (defaults).
  "GET /me/settings": () => json(settings()),
  // +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. No notifications by default.
  "GET /notifications": () => json({ data: [], unread_count: 0, next_cursor: null }),
  // +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. Nothing to sync by default.
  "GET /sync/pull": () => json({ changes: [], cursor: "c0", has_more: false }),
  // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. Every pushed change applies (version 1 more than its base).
  "POST /sync/push": (call) =>
    json({
      results: (call.body as { mutations: { mutation_id: string; base_version?: number }[] }).mutations.map((m) => ({
        mutation_id: m.mutation_id,
        status: "applied",
        version: (m.base_version ?? 0) + 1,
      })),
    }),
  "GET /admin/settings": () =>
    json({
      registration_mode: "invite",
      require_admin_2fa: false,
      demo_mode: false,
      smtp_configured: false,
      version: 1,
    }),
};

function matcher(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/** User settings as the API returns them (HAAL-045 defaults unless overridden). */
export function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    week_start: 1,
    time_format: "24h",
    theme: "system",
    default_color: "brown",
    agenda_days: 30,
    week_ab: { enabled: false, anchor: null, labels: ["A", "B"] },
    hidden_calendars: [], // +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094 (D-82).
    version: 1,
    ...overrides,
  };
}

// +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. The route for a test of what waits in the outbox: no sync run starts,
// so nothing is sent. A change being sent is never merged into or cancelled, and a push starts 400 ms after a write: on
// a slow machine (found on the CI runner) a test's next write came later than that, so a push that only never answered
// did not keep the outbox as the test expected.
export const noPush: Handler = () => new Promise<Response>(() => undefined);

export function stubApi(routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
  if (routes["POST /sync/push"] === noPush) {
    const hold = vi.spyOn(SyncEngine.prototype, "request").mockImplementation(() => undefined);
    onTestFinished(() => {
      hold.mockRestore();
    });
  }
  const table = Object.entries({ ...DEFAULTS, ...routes }).map(([key, handler]) => [matcher(key), handler] as const);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const isJson = (request.headers.get("Content-Type") ?? "").includes("json");
      const text = request.method === "GET" || !isJson ? "" : await request.clone().text();
      const call: Call = {
        method: request.method,
        path: path + url.search,
        body: text ? (JSON.parse(text) as unknown) : undefined, // binary bodies (uploads) are not decoded
        headers: request.headers,
      };
      calls.push(call);
      const found = table.find(([regex]) => regex.test(`${request.method} ${path}`));
      return found ? found[1](call) : problem(404, "not_found");
    }),
  );
  return calls;
}

export function renderApp(initialPath: string) {
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [initialPath] }));
  render(<App queryClient={queryClient} router={router} />);
  return { router, queryClient };
}

/** A single component with the query client, translations and the notification region (no router). */
export function renderWithProviders(ui: ReactNode) {
  const queryClient = createQueryClient();
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      <Notifications />
    </ThemeProvider>,
  );
  return { queryClient };
}
