// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Configures the generated API client (ADR-0007): same-origin /api/v1,
// session cookie sent automatically. CSRF header and error mapping are added with authentication (HAAL-160).
import { client } from "./generated/client.gen";

export const API_BASE_URL = "/api/v1";

// Absolute URL built from the current origin: identical in the browser, and valid for fetch in test environments.
client.setConfig({ baseUrl: new URL(API_BASE_URL, window.location.origin).toString(), credentials: "same-origin" });

export { client };
