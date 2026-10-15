// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Calendar module placeholder; day view arrives in HAAL-060.
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyPage } from "@/components/shell/EmptyPage";

function CalendarPage() {
  const { t } = useTranslation();
  return (
    <EmptyPage
      title={t("pages.calendar.title")}
      emptyTitle={t("pages.calendar.emptyTitle")}
      emptyBody={t("pages.calendar.emptyBody")}
      icon={CalendarDays}
    />
  );
}

export const Route = createFileRoute("/_app/calendar")({ component: CalendarPage });
