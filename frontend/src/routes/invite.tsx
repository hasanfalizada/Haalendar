// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Invitation page (link from the invitation e-mail): shows the invited
// address, creates the account with the policy-checked password and signs in. The token travels to the API in the
// request body, never in an API path, so it does not appear in server access logs.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { getInviteInfo, login, register } from "@/api/generated/sdk.gen";
import { ApiError, fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { rememberSession } from "@/api/session";
import { AuthCard } from "@/components/auth/AuthCard";
import { isViolation, passwordViolations, useViolationText } from "@/components/auth/password";
import { PasswordField } from "@/components/auth/PasswordField";
import { browserTimeZone } from "@/components/auth/timezone";
import { TimeZoneSelect } from "@/components/auth/TimeZoneSelect";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";

interface InviteSearch {
  token?: string;
}

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>): InviteSearch =>
    typeof search.token === "string" ? { token: search.token } : {},
  component: InvitePage,
});

type FieldName = "display_name" | "password" | "time_zone";

function InvitePage() {
  const { t } = useTranslation();
  const { token = "" } = Route.useSearch();
  const info = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, error } = await getInviteInfo({ body: { token } });
      if (error !== undefined) throw new ApiError(error);
      return data;
    },
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  if (!token || info.isError) {
    return (
      <AuthCard title={t("auth.invite.invalidTitle")} intro={t("auth.invite.invalidBody")}>
        <a href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("auth.invite.toLogin")}
        </a>
      </AuthCard>
    );
  }
  if (!info.data) {
    return (
      <AuthCard title={t("auth.invite.title")}>
        <p role="status" className="text-muted">
          {t("auth.invite.checking")}
        </p>
      </AuthCard>
    );
  }
  return <InviteForm token={token} email={info.data.email} />;
}

function InviteForm({ token, email }: { token: string; email: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const violationText = useViolationText();

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const violations = passwordViolations(password, email, displayName);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: Partial<Record<FieldName, string>> = {};
    if (!displayName.trim()) next.display_name = t("auth.required");
    const first = violations[0];
    if (first) next.password = violationText(first);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const created = await register({
        body: { email, password, display_name: displayName.trim(), time_zone: timeZone, invite_token: token },
      });
      if (created.error) {
        log.warn("invite_register_failed", { code: problemCode(created.error) });
        if (isProblem(created.error) && created.error.code === "validation_failed") {
          const mapped: Partial<Record<FieldName, string>> = {};
          for (const err of fieldErrorsOf(created.error)) {
            if (err.field === "password" && isViolation(err.code)) mapped.password ??= violationText(err.code);
            else if (err.field === "display_name" || err.field === "time_zone") mapped[err.field] ??= err.detail;
          }
          setErrors(mapped);
        } else {
          setFormError(t("auth.invite.invalidBody"));
        }
        return;
      }
      const signedIn = await login({ body: { email, password } });
      if (signedIn.error) {
        // The address already had an account (generic 202 by design): ask the person to sign in instead.
        log.info("invite_login_failed", { code: problemCode(signedIn.error) });
        setFormError(t("auth.invite.alreadyExists"));
        return;
      }
      rememberSession(queryClient, signedIn.data.me, signedIn.data.csrf_token);
      log.info("invite_accepted");
      await navigate({ to: "/calendar", replace: true });
    } catch (err) {
      log.warn("invite_unreachable", { error: describeError(err) });
      setFormError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("auth.invite.title")}
      intro={t("auth.invite.intro")}
      error={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <Field id="invite-email" label={t("auth.email")}>
        {(aria) => <Input {...aria} type="email" value={email} readOnly autoComplete="username" />}
      </Field>
      <Field id="invite-name" label={t("auth.name")} error={errors.display_name}>
        {(aria) => (
          <Input
            {...aria}
            autoComplete="name"
            maxLength={80}
            required
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
            }}
          />
        )}
      </Field>
      <PasswordField
        id="invite-password"
        label={t("auth.password")}
        value={password}
        onChange={setPassword}
        violations={violations}
        error={errors.password}
      />
      <TimeZoneSelect
        id="invite-tz"
        label={t("auth.timeZone")}
        value={timeZone}
        onChange={setTimeZone}
        error={errors.time_zone}
      />
      <Button type="submit" variant="primary" size="touch" disabled={busy}>
        {busy ? t("auth.invite.submitting") : t("auth.invite.submit")}
      </Button>
    </AuthCard>
  );
}
