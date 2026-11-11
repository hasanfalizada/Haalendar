// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Sign-in (FR-ACC-02): e-mail + password, then the TOTP code or a
// recovery code when the account has two-factor authentication. Generic messages never reveal whether an e-mail
// exists. After sign-in the user returns to the page that required it (same-origin paths only).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Links to password reset and (open mode) sign-up; an unconfirmed
// e-mail offers a new confirmation link.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Standalone links are 44 px touch targets (link-styles).
// +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. On the public demo: the banner, the demo accounts with one click, and no
// password reset (there is no mail).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { login } from "@/api/generated/sdk.gen";
import { demoStatusQuery } from "@/api/demo";
import { problemCode } from "@/api/problem";
import { meQuery, rememberSession, safeRedirect } from "@/api/session";
import { setupStatusQuery } from "@/api/setup";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { DemoBanner } from "@/components/shell/DemoBanner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";
import { STANDALONE_LINK } from "@/components/ui/link-styles";

interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.query(meQuery).catch(() => undefined);
    if (me) throw redirect({ to: safeRedirect(search.redirect), replace: true });
  },
  component: LoginPage,
});

type Step = "password" | "totp" | "recovery";

function LoginPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("password");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);
  const { data: status } = useQuery(setupStatusQuery);
  const { data: demo } = useQuery(demoStatusQuery);
  const demoAccounts = demo?.demo_mode ? (demo.accounts ?? []) : [];

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await signIn(email.trim(), password);
  }

  async function signIn(address: string, secret: string) {
    setError(null);
    setUnverified(null);
    setBusy(true);
    try {
      const { data, error: problem } = await login({
        body: {
          email: address,
          password: secret,
          ...(step === "totp" ? { totp_code: code } : {}),
          ...(step === "recovery" ? { recovery_code: code.trim() } : {}),
        },
      });
      if (problem) {
        const code_ = problemCode(problem);
        log.info("login_rejected", { code: code_ });
        if (code_ === "totp_required") {
          setStep("totp");
          return;
        }
        if (code_ === "invalid_credentials") {
          setError(step === "password" ? t("auth.login.errors.invalid") : t("auth.login.errors.invalidCode"));
        } else if (code_ === "account_locked" || code_ === "rate_limited") {
          setError(t("auth.login.errors.locked"));
        } else if (code_ === "email_not_verified") {
          setError(t("auth.login.errors.unverified"));
          setUnverified(address);
        } else {
          setError(t("auth.login.errors.generic"));
        }
        return;
      }
      rememberSession(queryClient, data.me, data.csrf_token);
      log.info("signed_in");
      await navigate({ to: data.me.must_change_password ? "/change-password" : safeRedirect(target), replace: true });
    } catch (err) {
      log.warn("login_unreachable", { error: describeError(err) });
      setError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  const secondFactor = step !== "password";
  return (
    <AuthCard
      title={t("auth.login.title")}
      intro={secondFactor ? t("auth.login.totpIntro") : t("auth.login.intro")}
      error={error}
      onSubmit={(e) => void onSubmit(e)}
    >
      <DemoBanner className="rounded-sm" />
      {!secondFactor ? (
        <>
          <Field id="login-email" label={t("auth.email")}>
            {(aria) => (
              <Input
                {...aria}
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            )}
          </Field>
          <Field id="login-password" label={t("auth.password")}>
            {(aria) => (
              <Input
                {...aria}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            )}
          </Field>
        </>
      ) : (
        <>
          <Field id="login-code" label={step === "totp" ? t("auth.login.totpLabel") : t("auth.login.recoveryLabel")}>
            {(aria) => (
              <Input
                {...aria}
                key={step}
                autoFocus
                inputMode={step === "totp" ? "numeric" : "text"}
                autoComplete="one-time-code"
                maxLength={step === "totp" ? 6 : 32}
                value={code}
                onChange={(e) => {
                  setCode(step === "totp" ? e.target.value.replace(/\D/g, "") : e.target.value);
                }}
              />
            )}
          </Field>
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => {
              setCode("");
              setError(null);
              setStep(step === "totp" ? "recovery" : "totp");
            }}
          >
            {step === "totp" ? t("auth.login.useRecovery") : t("auth.login.useTotp")}
          </Button>
        </>
      )}
      <Button type="submit" variant="primary" size="touch" disabled={busy}>
        {busy ? t("auth.login.submitting") : t("auth.login.submit")}
      </Button>
      {unverified ? <ResendVerification email={unverified} /> : null}
      {demoAccounts.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-[13px] text-muted">{t("demo.tryIt")}</p>
          {demoAccounts.map((account) => (
            <Button
              key={account.email}
              size="touch"
              disabled={busy}
              onClick={() => void signIn(account.email, account.password)}
            >
              {t("demo.signInAs", { name: account.display_name })}
            </Button>
          ))}
          <p className="text-[13px] break-words text-muted">
            {t("demo.credentials", {
              emails: demoAccounts.map((account) => account.email).join(", "),
              password: demoAccounts[0]?.password,
            })}
          </p>
        </div>
      ) : null}
      {!secondFactor ? (
        <div className="flex flex-wrap justify-between gap-2 text-[13px]">
          {demoAccounts.length === 0 ? (
            <Link to="/forgot-password" className={STANDALONE_LINK}>
              {t("auth.login.forgot")}
            </Link>
          ) : null}
          {status?.registration_mode === "open" ? (
            <Link to="/register" className={STANDALONE_LINK}>
              {t("auth.login.createAccount")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </AuthCard>
  );
}
