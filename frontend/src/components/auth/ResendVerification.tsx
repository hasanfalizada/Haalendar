// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. "Send the link again" for e-mail confirmation. The server answers
// 202 in every case (no account enumeration) and sends at most one e-mail per 5 minutes.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { resendVerificationEmail } from "@/api/generated/sdk.gen";
import { Button } from "@/components/ui/button";
import { describeError, log } from "@/lib/log";

export function ResendVerification({ email }: { email: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");

  async function resend() {
    setState("busy");
    try {
      const { error } = await resendVerificationEmail({ body: { email } });
      log.info("verification_resend_requested", { ok: error === undefined });
      setState(error === undefined ? "sent" : "failed");
    } catch (err) {
      log.warn("verification_resend_unreachable", { error: describeError(err) });
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={state === "busy" || state === "sent"} onClick={() => void resend()}>
        {t("auth.resend.button")}
      </Button>
      {state === "sent" ? (
        <p role="status" className="text-[13px] text-muted">
          {t("auth.resend.sent")}
        </p>
      ) : null}
      {state === "failed" ? (
        <p role="alert" className="text-[13px] text-danger">
          {t("auth.offline")}
        </p>
      ) : null}
    </div>
  );
}
