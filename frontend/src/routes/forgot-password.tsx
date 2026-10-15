// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. "Forgot password": requests a reset link. The answer is the same
// whether or not the address exists (no account enumeration); the link is valid for one hour and can be used once.
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { requestPasswordReset } from "@/api/generated/sdk.gen";
import { problemCode } from "@/api/problem";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setEmailError(t("auth.required"));
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    try {
      const { error: problem } = await requestPasswordReset({ body: { email: email.trim() } });
      if (problem !== undefined) {
        log.warn("password_reset_request_failed", { code: problemCode(problem) });
        setError(problemCode(problem) === "rate_limited" ? t("auth.forgot.rateLimited") : t("auth.forgot.failed"));
        return;
      }
      log.info("password_reset_requested");
      setSent(true);
    } catch (err) {
      log.warn("password_reset_request_unreachable", { error: describeError(err) });
      setError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title={t("auth.forgot.sentTitle")} intro={t("auth.forgot.sentBody", { email: email.trim() })}>
        <Link to="/login" className={linkClass}>
          {t("auth.toLogin")}
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={t("auth.forgot.title")}
      intro={t("auth.forgot.intro")}
      error={error}
      onSubmit={(e) => void onSubmit(e)}
    >
      <Field id="forgot-email" label={t("auth.email")} error={emailError}>
        {(aria) => (
          <Input
            {...aria}
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" size="touch" disabled={busy}>
        {t("auth.forgot.submit")}
      </Button>
      <Link to="/login" className={linkClass}>
        {t("auth.toLogin")}
      </Link>
    </AuthCard>
  );
}
