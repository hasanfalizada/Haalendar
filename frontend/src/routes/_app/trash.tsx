// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Trash placeholder; unified trash arrives in HAAL-033.
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyPage } from "@/components/shell/EmptyPage";

function TrashPage() {
  const { t } = useTranslation();
  return (
    <EmptyPage
      title={t("pages.trash.title")}
      emptyTitle={t("pages.trash.emptyTitle")}
      emptyBody={t("pages.trash.emptyBody")}
      icon={Trash2}
    />
  );
}

export const Route = createFileRoute("/_app/trash")({ component: TrashPage });
