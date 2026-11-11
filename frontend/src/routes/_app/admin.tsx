// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel route (/admin): administrators only; others are sent to
// the calendar. The server enforces the same rule on every admin endpoint.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminUsersPage } from "@/components/admin/AdminUsersPage";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (context.me && context.me.role !== "admin") throw redirect({ to: "/calendar", replace: true });
  },
  component: AdminUsersPage,
});
