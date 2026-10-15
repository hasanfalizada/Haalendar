// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Root route: not-found page.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Setup gate: while no administrator exists every route leads to /setup;
// afterwards /setup leads to the calendar. If the server is unreachable the gate does nothing (offline-first).
import { createRootRouteWithContext, Link, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { setupStatusQuery } from "@/api/setup";
import { describeError, log } from "@/lib/log";

export interface RouterContext {
  queryClient: QueryClient;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-lg font-semibold">{t("pages.notFound.title")}</h1>
        <Link to="/calendar" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("pages.notFound.back")}
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context, location }) => {
    const status = await context.queryClient.query(setupStatusQuery).catch((error: unknown) => {
      log.warn("setup_status_unavailable", { error: describeError(error) });
      return null;
    });
    if (!status) return;
    const onSetup = location.pathname === "/setup";
    if (status.setup_required && !onSetup) {
      throw redirect({ to: "/setup", replace: true });
    }
    if (!status.setup_required && onSetup) {
      throw redirect({ to: "/calendar", replace: true });
    }
  },
  component: Outlet,
  notFoundComponent: NotFound,
});
