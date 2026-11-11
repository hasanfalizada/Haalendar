// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. One mapping from admin API problems to user-facing text.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Now the `reasons` of runWrite: only the admin-specific codes are
// mapped here; everything else (no connection, server error, …) gets the common reasons of api/write.ts.
import { useTranslation } from "react-i18next";

import type { Problem } from "@/api/generated/types.gen";

/** Admin-specific reason for a failed request, or null for the common one. */
export function useAdminReasons(): (problem: Problem, context?: "reset" | "default") => string | null {
  const { t } = useTranslation();
  return (problem, context = "default") => {
    switch (problem.code) {
      case "invalid_state":
        return context === "reset" ? t("admin.errors.reactivateFirst") : t("admin.errors.lastAdmin");
      case "version_conflict":
        return t("admin.errors.changedMeanwhile");
      case "not_found":
        return t("admin.errors.notFound");
      case "totp_required":
        return t("admin.errors.totpRequired");
      case "forbidden":
        return t("admin.errors.forbidden");
      case "reauth_required":
        return t("admin.errors.reauthFailed");
      default:
        return null;
    }
  };
}
