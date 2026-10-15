// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Fake backend for page tests: routes like "POST /admin/users/*/deactivate"
// map to handlers; every request is recorded (method, path, JSON body, headers) for assertions.
import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "@/App";
import type { Me } from "@/api/generated/types.gen";
import { createAppRouter, createQueryClient } from "@/router";

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
    time_zone: "Europe/Berlin",
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
};

function matcher(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

export function stubApi(routes: Record<string, Handler>): Call[] {
  const calls: Call[] = [];
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
