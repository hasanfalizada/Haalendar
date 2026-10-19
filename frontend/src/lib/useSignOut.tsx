// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. One sign-out flow for the user menu and the profile section (D-39):
// with unsaved drafts on this device it asks first (they are deleted with the session), then signs out and opens the
// sign-in page. Returns the action and the confirmation dialog to render. returnFocus: where the focus goes when the
// confirmation is cancelled (the user menu's button; by default the element that had it).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { meQuery, signOut } from "@/api/session";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { countDrafts } from "@/lib/drafts";

export function useSignOut(returnFocus?: () => void): { requestSignOut: () => void; signOutDialog: ReactNode } {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  const [confirming, setConfirming] = useState(false);

  async function finish() {
    await signOut(queryClient);
    await navigate({ to: "/login", replace: true });
  }

  function requestSignOut() {
    if (!me) return;
    void countDrafts(me.id).then((count) => {
      if (count > 0) setConfirming(true);
      else void finish();
    });
  }

  const signOutDialog = (
    <ConfirmDialog
      open={confirming}
      title={t("drafts.signOutTitle")}
      body={t("drafts.signOutBody")}
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
        setConfirming(false);
        await finish();
      }}
      onClose={() => {
        setConfirming(false);
      }}
    />
  );
  return { requestSignOut, signOutDialog };
}
