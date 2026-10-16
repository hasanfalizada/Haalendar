// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Pending invitations with revoke (a revoked invitation is kept on the
// server, never deleted). Hidden while there are none.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. The result is reported through runWrite.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { adminInvitesQuery, adminKeys } from "@/api/admin";
import { adminRevokeInvite } from "@/api/generated/sdk.gen";
import type { AdminInvite } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useAdminReasons } from "./admin-errors";

export function PendingInvites({ formatDate }: { formatDate: (value: string) => string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const adminReasons = useAdminReasons();
  const { data: invites = [] } = useQuery(adminInvitesQuery);
  const [revoking, setRevoking] = useState<AdminInvite | null>(null);

  async function revoke(invite: AdminInvite) {
    await runWrite({
      name: "admin_invite_revoke",
      run: () => withReauth(() => adminRevokeInvite({ path: { id: invite.id } })),
      success: t("admin.invites.revoked", { email: invite.email }),
      reasons: (problem) => adminReasons(problem),
    });
    setRevoking(null);
    await queryClient.invalidateQueries({ queryKey: adminKeys.invites });
  }

  if (invites.length === 0) return null;
  return (
    <section aria-labelledby="pending-invites" className="flex flex-col gap-2 px-4 py-3">
      <h2 id="pending-invites" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("admin.invites.title")}
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-sm border border-line">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">{invite.email}</span>
            <span className="text-xs text-muted">
              {t(`admin.role.${invite.role}`)} · {t("admin.invites.expires", { date: formatDate(invite.expires_at) })}
            </span>
            <Button
              variant="ghost"
              aria-label={t("admin.invites.revokeFor", { email: invite.email })}
              onClick={() => {
                setRevoking(invite);
              }}
            >
              {t("admin.invites.revoke")}
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={revoking !== null}
        title={t("admin.invites.confirmTitle")}
        body={t("admin.invites.confirmBody", { email: revoking?.email ?? "" })}
        confirmLabel={t("admin.invites.revoke")}
        danger
        onConfirm={() => (revoking ? revoke(revoking) : Promise.resolve())}
        onClose={() => {
          setRevoking(null);
        }}
      />
    </section>
  );
}
