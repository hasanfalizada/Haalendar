// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. First-run wizard (FR-ACC-05): creates the first administrator and signs
// in. Full-screen, outside the app shell. Password rules are checked live with the shared policy atom; the server
// stays authoritative and its field errors (RFC 9457 `errors[]`) are mapped back onto the form.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { setCsrfToken } from "@/api/client";
import { createFirstAdmin } from "@/api/generated/sdk.gen";
import type { Problem } from "@/api/generated/types.gen";
import { setupStatusQuery } from "@/api/setup";
import { checkPassword, MIN_LENGTH, type PasswordViolation } from "@/atoms/accounts/passwordPolicy";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";

export const Route = createFileRoute("/setup")({ component: SetupPage });

type FieldName = "display_name" | "email" | "password" | "time_zone" | "setup_token";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_NAMES: readonly FieldName[] = ["display_name", "email", "password", "time_zone", "setup_token"];
const VIOLATIONS: readonly PasswordViolation[] = [
  "too_short",
  "too_long",
  "common",
  "contains_email",
  "contains_name",
  "low_variety",
];

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function timeZoneOptions(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(current) ? zones : [current, ...zones];
}

function isViolation(value: string | undefined): value is PasswordViolation {
  return VIOLATIONS.includes(value as PasswordViolation);
}

function SetupPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: status } = useQuery(setupStatusQuery);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [setupToken, setSetupToken] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const zones = useMemo(() => timeZoneOptions(timeZone), [timeZone]);
  const violations = password ? checkPassword(password, email, displayName) : [];
  const tokenRequired = status?.setup_token_required ?? false;
  const violationText = (v: PasswordViolation) => t(`pages.setup.violations.${v}`, { min: MIN_LENGTH });

  function applyProblem(problem: Problem) {
    if (problem.code === "validation_failed" && problem.errors?.length) {
      const next: FieldErrors = {};
      for (const err of problem.errors) {
        const name = err.pointer.slice(1) as FieldName;
        if (!FIELD_NAMES.includes(name) || next[name]) continue;
        next[name] = name === "password" && isViolation(err.code) ? violationText(err.code) : err.detail;
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
      setCsrfToken(data.csrf_token ?? null);
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
    <main className="grid min-h-dvh place-items-center bg-surface p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        noValidate
        className="flex w-full max-w-md flex-col gap-4 rounded-md border border-line bg-bg p-6 shadow-sm"
        aria-labelledby="setup-title"
      >
        <div className="flex flex-col gap-1">
          <img src="/icon.svg" alt="" className="mb-2 size-10" />
          <h1 id="setup-title" className="text-lg font-semibold">
            {t("pages.setup.title")}
          </h1>
          <p className="text-muted">{t("pages.setup.intro")}</p>
        </div>

        {formError ? (
          <p role="alert" className="rounded-sm bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
            {formError}
          </p>
        ) : null}

        <Field id="setup-name" label={t("pages.setup.name")} error={fieldErrors.display_name}>
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

        <Field id="setup-email" label={t("pages.setup.email")} error={fieldErrors.email}>
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

        <Field
          id="setup-password"
          label={t("pages.setup.password")}
          error={fieldErrors.password}
          hint={
            violations.length > 0 ? (
              <ul className="list-inside list-disc" aria-live="polite">
                {violations.map((v) => (
                  <li key={v}>{violationText(v)}</li>
                ))}
              </ul>
            ) : (
              t("pages.setup.passwordHint", { min: MIN_LENGTH })
            )
          }
        >
          {(aria) => (
            <Input
              {...aria}
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
          )}
        </Field>

        <Field id="setup-tz" label={t("pages.setup.timeZone")} error={fieldErrors.time_zone}>
          {(aria) => (
            <Select
              {...aria}
              value={timeZone}
              onChange={(e) => {
                setTimeZone(e.target.value);
              }}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          )}
        </Field>

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
      </form>
    </main>
  );
}
