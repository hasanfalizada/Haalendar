// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Configures the generated API client (ADR-0007): same-origin /api/v1,
// session cookie sent automatically. CSRF header and error mapping are added with authentication (HAAL-160).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-019. Every request carries an X-Request-ID; failed responses are logged
// with it so a browser-side error can be matched to the server's JSON log line (end-to-end correlation).
import { log } from "@/lib/log";

import { client } from "./generated/client.gen";

export const API_BASE_URL = "/api/v1";
export const REQUEST_ID_HEADER = "X-Request-ID";

/** 32 hex characters — accepted by the backend pattern [A-Za-z0-9._-]{1,64}. */
export function newRequestId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

// Absolute URL built from the current origin: identical in the browser, and valid for fetch in test environments.
client.setConfig({ baseUrl: new URL(API_BASE_URL, window.location.origin).toString(), credentials: "same-origin" });

client.interceptors.request.use((request) => {
  if (!request.headers.has(REQUEST_ID_HEADER)) request.headers.set(REQUEST_ID_HEADER, newRequestId());
  return request;
});

client.interceptors.response.use((response, request) => {
  if (!response.ok) {
    log.warn("api_request_failed", {
      status: response.status,
      method: request.method,
      path: new URL(request.url).pathname,
      request_id: request.headers.get(REQUEST_ID_HEADER),
    });
  }
  return response;
});

export { client };
