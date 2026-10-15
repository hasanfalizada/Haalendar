// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. To-Do module placeholder; notes arrive in HAAL-100.
import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyPage } from "@/components/shell/EmptyPage";

function TodoPage() {
  const { t } = useTranslation();
  return (
    <EmptyPage
      title={t("pages.todo.title")}
      emptyTitle={t("pages.todo.emptyTitle")}
      emptyBody={t("pages.todo.emptyBody")}
      icon={ListChecks}
    />
  );
}

export const Route = createFileRoute("/_app/todo")({ component: TodoPage });
