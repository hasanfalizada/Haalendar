// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. One sign-out flow for the user menu and the profile section (D-39):
// with unsaved drafts on this device it asks first (they are deleted with the session), then signs out and opens the
// sign-in page. Returns the action and the confirmation dialog to render. returnFocus: where the focus goes when the
// confirmation is cancelled (the user menu's button; by default the element that had it).
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. First the changes waiting in the outbox are sent (up to 5 s); what is
// still unsent (no connection) is named in the confirmation: "N changes will be lost".
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { meQuery, signOut } from "@/api/session";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { countDrafts } from "@/lib/drafts";
import { prepareSignOut } from "@/sync";

export function useSignOut(returnFocus?: () => void): { requestSignOut: () => void; signOutDialog: ReactNode } {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const [confirming, setConfirming] = useState<{ drafts: number; unsent: number } | null>(null);

  async function finish() {
    await signOut(queryClient);
    await navigate({ to: "/login", replace: true });
  }

  function requestSignOut() {
    if (!me) return;
    void Promise.all([countDrafts(me.id), prepareSignOut(me.id)]).then(([drafts, unsent]) => {
      if (drafts > 0 || unsent > 0) setConfirming({ drafts, unsent });
      else void finish();
    });
  }

  const signOutDialog = (
    <ConfirmDialog
      open={confirming !== null}
      title={t(confirming?.unsent ? "sync.signOutTitle" : "drafts.signOutTitle")}
      body={[
        ...(confirming?.unsent ? [t("sync.signOutBody", { count: confirming.unsent })] : []),
        ...(confirming?.drafts ? [t("drafts.signOutBody")] : []),
      ].join(" ")}
      confirmLabel={t("drafts.signOutConfirm")}
      danger
      {...(returnFocus
        ? {
            onCloseAutoFocus: (event: Event) => {
              event.preventDefault();
              returnFocus();
            },
          }
        : {})}
      onConfirm={async () => {
        setConfirming(null);
        await finish();
      }}
      onClose={() => {
        setConfirming(null);
      }}
    />
  );
  return { requestSignOut, signOutDialog };
}
