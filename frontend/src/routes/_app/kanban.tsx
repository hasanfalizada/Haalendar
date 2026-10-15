// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Kanban module placeholder; boards arrive in HAAL-110.
import { createFileRoute } from "@tanstack/react-router";
import { Columns3 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyPage } from "@/components/shell/EmptyPage";

function KanbanPage() {
  const { t } = useTranslation();
  return (
    <EmptyPage
      title={t("pages.kanban.title")}
      emptyTitle={t("pages.kanban.emptyTitle")}
      emptyBody={t("pages.kanban.emptyBody")}
      icon={Columns3}
    />
  );
}

export const Route = createFileRoute("/_app/kanban")({ component: KanbanPage });
