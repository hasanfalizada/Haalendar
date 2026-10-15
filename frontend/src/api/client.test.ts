// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-019. Correlation id on every API request and logging of failed responses.
import { afterEach, describe, expect, it, vi } from "vitest";

import { healthLive } from "@/api/generated/sdk.gen";
import { log } from "@/lib/log";

import { REQUEST_ID_HEADER } from "./client";

function captureFetch(status: number) {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      requests.push(input);
      return new Response(JSON.stringify({ status: "ok" }), { status });
    }),
  );
  return requests;
}

describe("API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a backend-compatible X-Request-ID with every request", async () => {
    const requests = captureFetch(200);
    await healthLive();
    await healthLive();
    const ids = requests.map((request) => request.headers.get(REQUEST_ID_HEADER));
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v1/health/live");
  });

  it("logs failed responses with the correlation id", async () => {
    const requests = captureFetch(503);
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
    await healthLive({ throwOnError: false });
    expect(warn).toHaveBeenCalledWith("api_request_failed", {
      status: 503,
      method: "GET",
      path: "/api/v1/health/live",
      request_id: requests[0]!.headers.get(REQUEST_ID_HEADER),
    });
  });
});
