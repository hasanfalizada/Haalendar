// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Security in Settings: change password (re-auth; other devices are
// signed out), two-factor authentication (QR enrolment, recovery codes, regeneration, turning off) and sessions
// (this device marked; sign out one or all others).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  changePassword,
  disableTotp,
  enableTotp,
  listSessions,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeSession,
  startTotpSetup,
} from "@/api/generated/sdk.gen";
import type { Me } from "@/api/generated/types.gen";
import { ApiError, fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { meQuery, meQueryKey } from "@/api/session";
import { isViolation, passwordViolations, useViolationText } from "@/components/auth/password";
import { PasswordField } from "@/components/auth/PasswordField";
import { REAUTH_CANCELLED, useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { QrCode } from "@/components/ui/qr-code";
import { formatInstant, useDisplayTimeZone } from "@/lib/datetime";
import { describeError, log } from "@/lib/log";
import { cn } from "@/lib/utils";

import { RecoveryCodesDialog } from "./RecoveryCodesDialog";

interface Notice {
  ok: boolean;
  text: string;
}

const sessionsQueryKey = ["session", "list"] as const;

function NoticeLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p role={notice.ok ? "status" : "alert"} className={cn("text-[13px]", notice.ok ? "text-primary" : "text-danger")}>
      {notice.text}
    </p>
  );
}

export function SecuritySection() {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  if (!me?.email) return null;
  return (
    <section aria-labelledby="security-title" className="flex flex-col gap-6 border-t border-line p-4">
      <h2 id="security-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("security.title")}
      </h2>
      <ChangePassword me={me} />
      <TwoFactor me={me} />
      <Sessions />
    </section>
  );
}

function ChangePassword({ me }: { me: Me }) {
  const { t } = useTranslation();
  const withReauth = useReauth();
  const violationText = useViolationText();
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const violations = passwordViolations(password, me.email, me.display_name);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const first = violations[0];
    if (first) {
      setFieldError(violationText(first));
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    try {
      const { error } = await withReauth(() => changePassword({ body: { new_password: password } }));
      if (error === REAUTH_CANCELLED) return;
      if (error !== undefined) {
        log.warn("password_change_failed", { code: problemCode(error) });
        const violation = isProblem(error) ? fieldErrorsOf(error).find((e) => isViolation(e.code)) : undefined;
        if (violation && isViolation(violation.code)) setFieldError(violationText(violation.code));
        else setNotice({ ok: false, text: t("security.password.failed") });
        return;
      }
      log.info("password_changed");
      setPassword("");
      setNotice({ ok: true, text: t("security.password.done") });
    } catch (err) {
      log.warn("password_change_unreachable", { error: describeError(err) });
      setNotice({ ok: false, text: t("auth.offline") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="flex max-w-md flex-col gap-3"
      aria-labelledby="pw-title"
    >
      <h3 id="pw-title" className="text-[13px] font-medium">
        {t("security.password.title")}
      </h3>
      <PasswordField
        id="security-new-password"
        label={t("auth.changePassword.newPassword")}
        value={password}
        onChange={setPassword}
        violations={violations}
        error={fieldError}
      />
      <NoticeLine notice={notice} />
      <Button type="submit" className="w-fit" disabled={busy || !password}>
        {t("security.password.submit")}
      </Button>
    </form>
  );
}

function TwoFactor({ me }: { me: Me }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const [enrolment, setEnrolment] = useState<{ uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  async function act<T>(event: string, run: () => Promise<{ data?: T; error?: unknown }>): Promise<T | null> {
    setNotice(null);
    setBusy(true);
    try {
      const { data, error } = await withReauth(run);
      if (error === REAUTH_CANCELLED) return null;
      if (error !== undefined) {
        const problem = problemCode(error);
        log.warn(`${event}_failed`, { code: problem });
        if (problem === "validation_failed") setCodeError(t("security.twoFactor.wrongCode"));
        else if (problem === "forbidden") setNotice({ ok: false, text: t("security.twoFactor.adminRequired") });
        else setNotice({ ok: false, text: t("security.twoFactor.failed") });
        return null;
      }
      log.info(`${event}_done`);
      return data ?? null;
    } catch (err) {
      log.warn(`${event}_unreachable`, { error: describeError(err) });
      setNotice({ ok: false, text: t("auth.offline") });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const data = await act("totp_setup", () => startTotpSetup());
    if (data) {
      setEnrolment({ uri: data.otpauth_uri, secret: data.secret });
      setCode("");
      setCodeError(undefined);
    }
  }

  async function confirm(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError(t("security.twoFactor.sixDigits"));
      return;
    }
    setCodeError(undefined);
    const data = await act("totp_enable", () => enableTotp({ body: { totp_code: code } }));
    if (data) {
      setEnrolment(null);
      setCodes(data.recovery_codes);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
  }

  async function regenerate() {
    const data = await act("recovery_codes_regenerate", () => regenerateRecoveryCodes());
    if (data) setCodes(data.recovery_codes);
  }

  async function turnOff() {
    setConfirmOff(false);
    const result = await act<unknown>("totp_disable", async () => {
      const response = await disableTotp();
      return response.error === undefined ? { data: true } : { error: response.error };
    });
    if (result) {
      setNotice({ ok: true, text: t("security.twoFactor.offDone") });
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-3" aria-labelledby="tfa-title" role="group">
      <h3 id="tfa-title" className="text-[13px] font-medium">
        {t("security.twoFactor.title")}
      </h3>
      <p className="text-[13px] text-muted">
        {me.totp_enabled ? t("security.twoFactor.on") : t("security.twoFactor.off")}
      </p>
      <NoticeLine notice={notice} />

      {!me.totp_enabled && !enrolment ? (
        <Button className="w-fit" disabled={busy} onClick={() => void start()}>
          {t("security.twoFactor.setUp")}
        </Button>
      ) : null}

      {enrolment ? (
        <form onSubmit={(e) => void confirm(e)} noValidate className="flex flex-col gap-3">
          <p className="text-[13px]">{t("security.twoFactor.scan")}</p>
          <QrCode value={enrolment.uri} label={t("security.twoFactor.qrLabel")} />
          <p className="text-[13px] text-muted">
            {t("security.twoFactor.manual")} <code className="font-mono break-all text-fg">{enrolment.secret}</code>
          </p>
          <Field id="tfa-code" label={t("auth.login.totpLabel")} error={codeError}>
            {(aria) => (
              <Input
                {...aria}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                }}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {t("security.twoFactor.confirm")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEnrolment(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {me.totp_enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void regenerate()}>
            {t("security.twoFactor.regenerate")}
          </Button>
          {confirmOff ? (
            <span className="flex items-center gap-1" role="group" aria-label={t("sharing.confirmGroup")}>
              <Button variant="danger" disabled={busy} onClick={() => void turnOff()}>
                {t("security.twoFactor.confirmOff")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmOff(false);
                }}
              >
                {t("common.cancel")}
              </Button>
            </span>
          ) : (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirmOff(true);
              }}
            >
              {t("security.twoFactor.turnOff")}
            </Button>
          )}
        </div>
      ) : null}

      <RecoveryCodesDialog
        codes={codes}
        onClose={() => {
          setCodes(null);
        }}
      />
    </div>
  );
}

function Sessions() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const timeZone = useDisplayTimeZone();
  const [notice, setNotice] = useState<Notice | null>(null);
  const sessions = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: async () => {
      const { data, error } = await listSessions();
      if (error !== undefined) throw new ApiError(error);
      return data.data;
    },
    retry: false,
  });

  async function run(event: string, request: () => Promise<{ error?: unknown }>, done: string) {
    setNotice(null);
    try {
      const { error } = await request();
      if (error !== undefined) {
        log.warn(`${event}_failed`, { code: problemCode(error) });
        setNotice({ ok: false, text: t("security.sessions.failed") });
      } else {
        log.info(`${event}_done`);
        setNotice({ ok: true, text: done });
      }
    } catch (err) {
      log.warn(`${event}_unreachable`, { error: describeError(err) });
      setNotice({ ok: false, text: t("auth.offline") });
    }
    await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
  }

  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current).length;
  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby="sessions-title">
      <h3 id="sessions-title" className="text-[13px] font-medium">
        {t("security.sessions.title")}
      </h3>
      <NoticeLine notice={notice} />
      <ul className="flex flex-col divide-y divide-line rounded-sm border border-line">
        {list.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {session.device ?? t("security.sessions.unknownDevice")}
                {session.current ? (
                  <span className="ml-2 rounded-sm bg-primary-tint px-1.5 py-0.5 text-xs text-primary">
                    {t("security.sessions.thisDevice")}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs text-muted">
                {t("security.sessions.lastActive", {
                  date: formatInstant(session.last_seen_at, timeZone, i18n.language),
                })}
                {session.ip_prefix ? ` · ${session.ip_prefix}` : ""}
              </span>
            </span>
            {session.current ? null : (
              <Button
                variant="ghost"
                aria-label={t("security.sessions.signOutDevice", { device: session.device ?? "" })}
                onClick={() =>
                  void run(
                    "session_revoke",
                    () => revokeSession({ path: { id: session.id } }),
                    t("security.sessions.revoked"),
                  )
                }
              >
                {t("security.sessions.signOut")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <Button
          className="w-fit"
          onClick={() =>
            void run("sessions_revoke_others", () => revokeOtherSessions(), t("security.sessions.othersRevoked"))
          }
        >
          {t("security.sessions.signOutOthers")}
        </Button>
      ) : null}
    </div>
  );
}
