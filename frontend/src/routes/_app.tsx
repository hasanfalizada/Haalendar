// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Pathless layout: every module page lives inside the application shell;
// full-screen pages (setup, later sign-in) sit next to it at the root. The shell is needed by every module page, so it is
// kept in the entry bundle (no code split) instead of costing an extra request before each first paint.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Session gate: not signed in → /login (returning here afterwards);
// a pending one-time password → /change-password. If the server is unreachable the gate lets the shell open
// (offline-first); `me` is then null in the route context.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { meQuery } from "@/api/session";
import { AppShell } from "@/components/shell/AppShell";
import { describeError, log } from "@/lib/log";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.query(meQuery).catch((error: unknown) => {
      log.warn("session_check_unavailable", { error: describeError(error) });
      return undefined;
    });
    if (me === null) throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    if (me?.must_change_password) throw redirect({ to: "/change-password", replace: true });
    return { me: me ?? null };
  },
  component: AppShell,
  codeSplitGroupings: [],
});
