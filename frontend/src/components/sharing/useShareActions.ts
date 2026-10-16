// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Share mutations with one error mapping, used by the share dialog and
// the Settings overview. Every success refreshes all share lists.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Through runWrite: every change now reports its result (permission
// changes and removals used to succeed silently). Inside the share dialog failures are returned for the dialog to
// show ("inline"); in Settings they are notifications.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createShare, revokeShare, updateShare } from "@/api/generated/sdk.gen";
import type { ContainerKind, Permission, Problem, Share } from "@/api/generated/types.gen";
import { sharingKeys } from "@/api/sharing";
import { runWrite } from "@/api/write";

export interface ActionResult {
  ok: boolean;
  /** Message for the e-mail field (share creation). */
  fieldError?: string;
  /** Message for the whole form or list (inline mode). */
  error?: string;
}

export function useShareActions(display: "toast" | "inline" = "toast") {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  function generic(problem: Problem): string | null {
    switch (problem.code) {
      case "not_found":
        return t("sharing.errors.notFound");
      case "forbidden":
        return t("sharing.errors.ownerOnly");
      case "version_conflict":
        return t("sharing.errors.changedMeanwhile");
      default:
        return null;
    }
  }

  async function run(
    name: string,
    request: () => Promise<{ error?: unknown; response?: Response }>,
    success: string,
    reasons: (problem: Problem) => string | null = generic,
    failure: "toast" | "inline" = display,
  ): Promise<ActionResult> {
    const result = await runWrite({ name, run: request, success, reasons, failure });
    await queryClient.invalidateQueries({ queryKey: sharingKeys.all });
    return result.ok ? { ok: true } : { ok: false, ...(result.reason ? { error: result.reason } : {}) };
  }

  return {
    share: async (
      containerKind: ContainerKind,
      containerId: string,
      email: string,
      permission: Permission,
    ): Promise<ActionResult> => {
      let fieldError: string | undefined;
      const fieldReason = (problem: Problem): string | null => {
        const code = problem.errors?.[0]?.code;
        if (code === "user_not_found") return t("sharing.errors.userNotFound");
        if (code === "self") return t("sharing.errors.self");
        if (problem.code === "duplicate") return t("sharing.errors.duplicate");
        if (problem.code === "validation_failed") return t("sharing.errors.email");
        return null;
      };
      const result = await run(
        "share_create",
        () =>
          createShare({
            body: { container_kind: containerKind, container_id: containerId, grantee_email: email, permission },
          }),
        t("sharing.shared", { email }),
        (problem) => {
          fieldError = fieldReason(problem) ?? undefined;
          return fieldError ?? generic(problem);
        },
        // Field-level answers belong next to the field, so the share form always shows its failures itself.
        "inline",
      );
      if (result.ok) return result;
      return fieldError ? { ok: false, fieldError } : result;
    },
    changePermission: (share: Share, permission: Permission) =>
      run(
        "share_update",
        () =>
          updateShare({
            path: { id: share.id },
            headers: { "If-Match": `"${String(share.version)}"` },
            body: { permission },
          }),
        t("sharing.permissionChanged", { permission: t(`sharing.permission.${permission}`) }),
      ),
    revoke: (share: Share, mode: "owner" | "grantee") =>
      run(
        mode === "owner" ? "share_revoke" : "share_leave",
        () => revokeShare({ path: { id: share.id } }),
        mode === "owner" ? t("sharing.removed") : t("sharing.left", { name: share.container_name }),
      ),
  };
}
