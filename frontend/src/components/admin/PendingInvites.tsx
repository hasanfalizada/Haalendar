// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Pending invitations with revoke (a revoked invitation is kept on the
// server, never deleted). Hidden while there are none.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { adminInvitesQuery, adminKeys } from "@/api/admin";
import { adminRevokeInvite } from "@/api/generated/sdk.gen";
import type { AdminInvite } from "@/api/generated/types.gen";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { describeError, log } from "@/lib/log";

import { useAdminErrorText } from "./admin-errors";

interface PendingInvitesProps {
  onResult: (result: { ok: boolean; text: string }) => void;
  formatDate: (value: string) => string;
}

export function PendingInvites({ onResult, formatDate }: PendingInvitesProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const errorText = useAdminErrorText();
  const { data: invites = [] } = useQuery(adminInvitesQuery);
  const [revoking, setRevoking] = useState<AdminInvite | null>(null);

  async function revoke(invite: AdminInvite) {
    try {
      const { error } = await withReauth(() => adminRevokeInvite({ path: { id: invite.id } }));
      const text = error === undefined ? t("admin.invites.revoked", { email: invite.email }) : errorText(error);
      if (text) onResult({ ok: error === undefined, text });
      log.info("admin_invite_revoke_done", { ok: error === undefined });
    } catch (err) {
      log.warn("admin_invite_revoke_unreachable", { error: describeError(err) });
      onResult({ ok: false, text: t("auth.offline") });
    }
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
