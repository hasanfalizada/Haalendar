// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Share mutations with one error mapping, used by the share dialog and
// the Settings overview. Every success refreshes all share lists.
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { createShare, revokeShare, updateShare } from "@/api/generated/sdk.gen";
import type { ContainerKind, Permission, Share } from "@/api/generated/types.gen";
import { fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { sharingKeys } from "@/api/sharing";
import { describeError, log } from "@/lib/log";

export interface ActionResult {
  ok: boolean;
  /** Message for the e-mail field (share creation). */
  fieldError?: string;
  /** Message for the whole form or list. */
  error?: string;
}

export function useShareActions() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  async function run(
    event: string,
    request: () => Promise<{ error?: unknown }>,
    map: (error: unknown) => ActionResult,
  ) {
    try {
      const { error } = await request();
      if (error !== undefined) {
        log.warn(`${event}_failed`, { code: problemCode(error) });
        await queryClient.invalidateQueries({ queryKey: sharingKeys.all });
        return map(error);
      }
      log.info(`${event}_done`);
      await queryClient.invalidateQueries({ queryKey: sharingKeys.all });
      return { ok: true };
    } catch (err) {
      log.warn(`${event}_unreachable`, { error: describeError(err) });
      return { ok: false, error: t("sharing.errors.offline") };
    }
  }

  function generic(error: unknown): ActionResult {
    switch (problemCode(error)) {
      case "not_found":
        return { ok: false, error: t("sharing.errors.notFound") };
      case "forbidden":
        return { ok: false, error: t("sharing.errors.ownerOnly") };
      case "version_conflict":
        return { ok: false, error: t("sharing.errors.changedMeanwhile") };
      default:
        return { ok: false, error: t("sharing.errors.generic") };
    }
  }

  return {
    share: (containerKind: ContainerKind, containerId: string, email: string, permission: Permission) =>
      run(
        "share_create",
        () =>
          createShare({
            body: { container_kind: containerKind, container_id: containerId, grantee_email: email, permission },
          }),
        (error) => {
          const code = isProblem(error) ? fieldErrorsOf(error)[0]?.code : undefined;
          if (code === "user_not_found") return { ok: false, fieldError: t("sharing.errors.userNotFound") };
          if (code === "self") return { ok: false, fieldError: t("sharing.errors.self") };
          if (problemCode(error) === "duplicate") return { ok: false, fieldError: t("sharing.errors.duplicate") };
          if (problemCode(error) === "validation_failed") return { ok: false, fieldError: t("sharing.errors.email") };
          return generic(error);
        },
      ),
    changePermission: (share: Share, permission: Permission) =>
      run(
        "share_update",
        () =>
          updateShare({
            path: { id: share.id },
            headers: { "If-Match": `"${String(share.version)}"` },
            body: { permission },
          }),
        generic,
      ),
    revoke: (share: Share) => run("share_revoke", () => revokeShare({ path: { id: share.id } }), generic),
  };
}
