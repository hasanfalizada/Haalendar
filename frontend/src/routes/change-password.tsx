// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Mandatory new password after a one-time password (admin invitation
// without SMTP or admin reset; ASVS V6). Nothing else is reachable until it is set. Changing the password from the
// profile arrives with the auth UI task.
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { changePassword } from "@/api/generated/sdk.gen";
import { fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { meQuery, meQueryKey, signOut } from "@/api/session";
import { AuthCard } from "@/components/auth/AuthCard";
import { isViolation, passwordViolations, useViolationText } from "@/components/auth/password";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { describeError, log } from "@/lib/log";

export const Route = createFileRoute("/change-password")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.query(meQuery).catch(() => undefined);
    if (me === null) throw redirect({ to: "/login", replace: true });
    if (me && !me.must_change_password) throw redirect({ to: "/calendar", replace: true });
    return { me: me ?? null };
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { me } = Route.useRouteContext();
  const violationText = useViolationText();

  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const violations = passwordViolations(password, me?.email, me?.display_name);

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
      const { error: problem } = await changePassword({ body: { new_password: password } });
      if (problem) {
        log.warn("password_change_failed", { code: problemCode(problem) });
        const serverViolation = isProblem(problem)
          ? fieldErrorsOf(problem).find((e) => isViolation(e.code))
          : undefined;
        if (serverViolation && isViolation(serverViolation.code)) setFieldError(violationText(serverViolation.code));
        else setError(t("auth.changePassword.failed"));
        return;
      }
      log.info("password_changed");
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      await navigate({ to: "/calendar", replace: true });
    } catch (err) {
      log.warn("password_change_unreachable", { error: describeError(err) });
      setError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("auth.changePassword.title")}
      intro={t("auth.changePassword.intro")}
      error={error}
      onSubmit={(e) => void onSubmit(e)}
    >
      <PasswordField
        id="new-password"
        label={t("auth.changePassword.newPassword")}
        value={password}
        onChange={setPassword}
        violations={violations}
        error={fieldError}
      />
      <Button type="submit" variant="primary" size="touch" disabled={busy}>
        {busy ? t("auth.changePassword.submitting") : t("auth.changePassword.submit")}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          void signOut(queryClient).then(() => navigate({ to: "/login", replace: true }));
        }}
      >
        {t("auth.signOut")}
      </Button>
    </AuthCard>
  );
}
