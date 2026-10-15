// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. New password from the reset link (single use, 1 hour). All sessions
// of the account are signed out by the server; the user signs in again afterwards.
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { confirmPasswordReset } from "@/api/generated/sdk.gen";
import { fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { AuthCard } from "@/components/auth/AuthCard";
import { isViolation, passwordViolations, useViolationText } from "@/components/auth/password";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { describeError, log } from "@/lib/log";

interface ResetSearch {
  token?: string;
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetSearch =>
    typeof search.token === "string" ? { token: search.token } : {},
  component: ResetPasswordPage,
});

const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

function ResetPasswordPage() {
  const { t } = useTranslation();
  const { token = "" } = Route.useSearch();
  const violationText = useViolationText();
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const violations = passwordViolations(password);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const first = violations[0];
    if (first) {
      setFieldError(violationText(first));
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    try {
      const { error: problem } = await confirmPasswordReset({ body: { token, new_password: password } });
      if (problem !== undefined) {
        log.warn("password_reset_failed", { code: problemCode(problem) });
        const violation = isProblem(problem) ? fieldErrorsOf(problem).find((e) => isViolation(e.code)) : undefined;
        if (violation && isViolation(violation.code)) setFieldError(violationText(violation.code));
        else setError(t("auth.reset.invalid"));
        return;
      }
      log.info("password_reset_done");
      setDone(true);
    } catch (err) {
      log.warn("password_reset_unreachable", { error: describeError(err) });
      setError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title={t("auth.reset.title")} intro={t("auth.reset.invalid")}>
        <Link to="/forgot-password" className={linkClass}>
          {t("auth.reset.newLink")}
        </Link>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title={t("auth.reset.doneTitle")} intro={t("auth.reset.doneBody")}>
        <Link to="/login" className={linkClass}>
          {t("auth.toLogin")}
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={t("auth.reset.title")}
      intro={t("auth.reset.intro")}
      error={error}
      onSubmit={(e) => void onSubmit(e)}
    >
      <PasswordField
        id="reset-password"
        label={t("auth.changePassword.newPassword")}
        value={password}
        onChange={setPassword}
        violations={violations}
        error={fieldError}
      />
      <Button type="submit" variant="primary" size="touch" disabled={busy}>
        {t("auth.reset.submit")}
      </Button>
      {error ? (
        <Link to="/forgot-password" className={linkClass}>
          {t("auth.reset.newLink")}
        </Link>
      ) : null}
    </AuthCard>
  );
}
