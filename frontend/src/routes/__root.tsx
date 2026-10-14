// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Root route: application shell + not-found page.
import { createRootRouteWithContext, Link } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/shell/AppShell";

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
  component: AppShell,
  notFoundComponent: NotFound,
});
