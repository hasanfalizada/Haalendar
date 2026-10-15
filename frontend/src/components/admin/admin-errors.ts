// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. One mapping from admin API problems to user-facing text.
import { useTranslation } from "react-i18next";

import { problemCode } from "@/api/problem";
import { REAUTH_CANCELLED } from "@/components/auth/reauth";

/** Text for a failed admin request, or null when there is nothing to show (re-auth cancelled by the user). */
export function useAdminErrorText(): (error: unknown, context?: "reset" | "default") => string | null {
  const { t } = useTranslation();
  return (error, context = "default") => {
    if (error === REAUTH_CANCELLED) return null;
    switch (problemCode(error)) {
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
      case null:
        return t("auth.offline");
      default:
        return t("admin.errors.generic");
    }
  };
}
