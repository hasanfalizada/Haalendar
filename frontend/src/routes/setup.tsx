// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. First-run wizard (FR-ACC-05): creates the first administrator and signs
// in. Full-screen, outside the app shell. Password rules are checked live with the shared policy atom; the server
// stays authoritative and its field errors (RFC 9457 `errors[]`) are mapped back onto the form.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Uses the shared auth card, password field and time-zone picker;
// the new session is stored like any sign-in.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { createFirstAdmin } from "@/api/generated/sdk.gen";
import type { Problem } from "@/api/generated/types.gen";
import { fieldErrorsOf } from "@/api/problem";
import { rememberSession } from "@/api/session";
import { setupStatusQuery } from "@/api/setup";
import { AuthCard } from "@/components/auth/AuthCard";
import { isViolation, passwordViolations, useViolationText } from "@/components/auth/password";
import { PasswordField } from "@/components/auth/PasswordField";
import { browserTimeZone } from "@/components/auth/timezone";
import { TimeZoneSelect } from "@/components/auth/TimeZoneSelect";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";

export const Route = createFileRoute("/setup")({ component: SetupPage });

type FieldName = "display_name" | "email" | "password" | "time_zone" | "setup_token";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_NAMES: readonly string[] = ["display_name", "email", "password", "time_zone", "setup_token"];

function SetupPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: status } = useQuery(setupStatusQuery);
  const violationText = useViolationText();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [setupToken, setSetupToken] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const violations = passwordViolations(password, email, displayName);
  const tokenRequired = status?.setup_token_required ?? false;

  function applyProblem(problem: Problem) {
    if (problem.code === "validation_failed" && problem.errors?.length) {
      const next: FieldErrors = {};
      for (const err of fieldErrorsOf(problem)) {
        if (!FIELD_NAMES.includes(err.field)) continue;
        const name = err.field as FieldName;
        next[name] ??= name === "password" && isViolation(err.code) ? violationText(err.code) : err.detail;
      }
      setFieldErrors(next);
      return;
    }
    if (problem.code === "forbidden") setFieldErrors({ setup_token: t("pages.setup.errors.forbidden") });
    else if (problem.code === "duplicate") setFieldErrors({ email: t("pages.setup.errors.duplicate") });
    else if (problem.code === "invalid_state") setFormError(t("pages.setup.errors.alreadyDone"));
    else setFormError(t("pages.setup.errors.generic"));
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const firstViolation = violations[0];
    if (firstViolation) {
      setFieldErrors({ password: violationText(firstViolation) });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const { data, error } = await createFirstAdmin({
        body: {
          display_name: displayName.trim(),
          email: email.trim(),
          password,
          time_zone: timeZone,
          ...(tokenRequired ? { setup_token: setupToken } : {}),
        },
      });
      if (error) {
        log.warn("setup_admin_failed", { code: error.code });
        applyProblem(error);
        return;
      }
      rememberSession(queryClient, data, data.csrf_token ?? "");
      log.info("setup_admin_created");
      if (status) queryClient.setQueryData(setupStatusQuery.queryKey, { ...status, setup_required: false });
      await queryClient.invalidateQueries({ queryKey: setupStatusQuery.queryKey });
      await navigate({ to: "/calendar", replace: true });
    } catch (error) {
      log.warn("setup_admin_unreachable", { error: describeError(error) });
      setFormError(t("pages.setup.errors.offline"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      title={t("pages.setup.title")}
      intro={t("pages.setup.intro")}
      error={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <Field id="setup-name" label={t("auth.name")} error={fieldErrors.display_name}>
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

      <Field id="setup-email" label={t("auth.email")} error={fieldErrors.email}>
        {(aria) => (
          <Input
            {...aria}
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        )}
      </Field>

      <PasswordField
        id="setup-password"
        label={t("auth.password")}
        value={password}
        onChange={setPassword}
        violations={violations}
        error={fieldErrors.password}
      />

      <TimeZoneSelect
        id="setup-tz"
        label={t("auth.timeZone")}
        value={timeZone}
        onChange={setTimeZone}
        error={fieldErrors.time_zone}
      />

      {tokenRequired ? (
        <Field
          id="setup-token"
          label={t("pages.setup.setupToken")}
          hint={t("pages.setup.setupTokenHint")}
          error={fieldErrors.setup_token}
        >
          {(aria) => (
            <Input
              {...aria}
              type="password"
              autoComplete="off"
              maxLength={256}
              required
              value={setupToken}
              onChange={(e) => {
                setSetupToken(e.target.value);
              }}
            />
          )}
        </Field>
      ) : null}

      <Button type="submit" variant="primary" size="touch" disabled={submitting}>
        {submitting ? t("pages.setup.submitting") : t("pages.setup.submit")}
      </Button>
    </AuthCard>
  );
}
