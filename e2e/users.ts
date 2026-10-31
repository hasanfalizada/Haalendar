// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. The administrator the run creates (or signs in as).
export const ADMIN = {
  name: process.env.E2E_ADMIN_NAME ?? "Ada Admin",
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "quiet-mountain-river-42",
};
