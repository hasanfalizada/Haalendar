// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Open sign-up (only when the instance allows it): name, e-mail,
// policy-checked password and time zone; then "check your inbox" with a resend button. The server answers 202 for
// every accepted request, so an existing address is not revealed here.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Standalone links are 44 px touch targets (link-styles).
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { register } from "@/api/generated/sdk.gen";
import { fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { setupStatusQuery } from "@/api/setup";
import { AuthCard } from "@/components/auth/AuthCard";
import { isViolation, passwordViolations, useViolationText } from "@/components/auth/password";
import { PasswordField } from "@/components/auth/PasswordField";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { browserTimeZone } from "@/components/auth/timezone";
import { TimeZoneSelect } from "@/components/auth/TimeZoneSelect";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";
import { INLINE_LINK, STANDALONE_LINK } from "@/components/ui/link-styles";

export const Route = createFileRoute("/register")({ component: RegisterPage });

type FieldName = "display_name" | "email" | "password" | "time_zone";

const linkClass = STANDALONE_LINK;

function RegisterPage() {
  const { t } = useTranslation();
  const { data: status, isPending } = useQuery(setupStatusQuery);
  const violationText = useViolationText();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const violations = passwordViolations(password, email, displayName);

  if (isPending) return null;
  if (status?.registration_mode !== "open") {
    return (
      <AuthCard title={t("auth.register.closedTitle")} intro={t("auth.register.closedBody")}>
        <Link to="/login" className={linkClass}>
          {t("auth.toLogin")}
        </Link>
      </AuthCard>
    );
  }
  if (sentTo) {
    return (
      <AuthCard title={t("auth.register.checkTitle")} intro={t("auth.register.checkBody", { email: sentTo })}>
        <ResendVerification email={sentTo} />
        <Link to="/login" className={linkClass}>
          {t("auth.toLogin")}
        </Link>
      </AuthCard>
    );
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const next: Partial<Record<FieldName, string>> = {};
    if (!displayName.trim()) next.display_name = t("auth.required");
    if (!email.trim()) next.email = t("auth.required");
    const first = violations[0];
    if (first) next.password = violationText(first);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const { error } = await register({
        body: { email: email.trim(), password, display_name: displayName.trim(), time_zone: timeZone },
      });
      if (error !== undefined) {
        log.warn("register_failed", { code: problemCode(error) });
        if (isProblem(error) && error.code === "validation_failed") {
          const mapped: Partial<Record<FieldName, string>> = {};
          for (const err of fieldErrorsOf(error)) {
            if (err.field === "password" && isViolation(err.code)) mapped.password ??= violationText(err.code);
            else if (err.field === "email" || err.field === "display_name" || err.field === "time_zone")
              mapped[err.field] ??= err.detail;
          }
          setErrors(mapped);
        } else if (problemCode(error) === "forbidden") {
          setFormError(t("auth.register.closedBody"));
        } else {
          setFormError(t("auth.register.failed"));
        }
        return;
      }
      log.info("registered");
      setSentTo(email.trim());
    } catch (err) {
      log.warn("register_unreachable", { error: describeError(err) });
      setFormError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t("auth.register.title")}
      intro={t("auth.register.intro")}
      error={formError}
      onSubmit={(e) => void onSubmit(e)}
    >
      <Field id="register-name" label={t("auth.name")} error={errors.display_name}>
        {(aria) => (
          <Input
            {...aria}
            autoComplete="name"
            maxLength={80}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
            }}
          />
        )}
      </Field>
      <Field id="register-email" label={t("auth.email")} error={errors.email}>
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
      <PasswordField
        id="register-password"
        label={t("auth.password")}
        value={password}
        onChange={setPassword}
        violations={violations}
        error={errors.password}
      />
      <TimeZoneSelect
        id="register-tz"
        label={t("auth.timeZone")}
        value={timeZone}
        onChange={setTimeZone}
        error={errors.time_zone}
      />
      <Button type="submit" variant="primary" size="touch" disabled={busy}>
        {busy ? t("auth.register.submitting") : t("auth.register.submit")}
      </Button>
      <p className="text-center text-[13px] text-muted">
        {t("auth.register.haveAccount")}{" "}
        <Link to="/login" className={INLINE_LINK}>
          {t("auth.login.submit")}
        </Link>
      </p>
    </AuthCard>
  );
}
