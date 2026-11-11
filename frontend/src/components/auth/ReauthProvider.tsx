// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Re-authentication for sensitive actions (ADR-0005: 15-minute window).
// withReauth(run) executes a request; when the server answers 403 reauth_required, a password (and TOTP) dialog opens,
// POST /auth/reauth confirms identity and the request is retried once. Cancelling resolves with REAUTH_CANCELLED.
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, type SubmitEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { reauthenticate } from "@/api/generated/sdk.gen";
import { problemCode } from "@/api/problem";
import { meQuery } from "@/api/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";

import { REAUTH_CANCELLED, ReauthContext, type WithReauth } from "./reauth";

export function ReauthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const askForReauth = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pending.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const finish = useCallback((confirmed: boolean) => {
    setOpen(false);
    pending.current?.(confirmed);
    pending.current = null;
  }, []);

  const withReauth = useCallback<WithReauth>(
    async (run) => {
      const first = await run();
      if (problemCode(first.error) !== "reauth_required") return first;
      log.info("reauth_requested");
      if (!(await askForReauth())) return { error: REAUTH_CANCELLED };
      return run();
    },
    [askForReauth],
  );

  return (
    <ReauthContext.Provider value={withReauth}>
      {children}
      <ReauthDialog open={open} onDone={finish} />
    </ReauthContext.Provider>
  );
}

function ReauthDialog({ open, onDone }: { open: boolean; onDone: (confirmed: boolean) => void }) {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsCode = me?.totp_enabled ?? false;

  function close(confirmed: boolean) {
    setPassword("");
    setCode("");
    setError(null);
    onDone(confirmed);
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: problem } = await reauthenticate({
        body: { password, ...(needsCode ? { totp_code: code } : {}) },
      });
      if (problem) {
        log.warn("reauth_failed", { code: problemCode(problem) });
        setError(problemCode(problem) === "rate_limited" ? t("auth.reauth.rateLimited") : t("auth.reauth.wrong"));
        return;
      }
      log.info("reauth_confirmed");
      close(true);
    } catch (err) {
      log.warn("reauth_unreachable", { error: describeError(err) });
      setError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(false);
      }}
    >
      <DialogContent
        title={t("auth.reauth.title")}
        description={t("auth.reauth.description")}
        closeLabel={t("common.close")}
      >
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
          <Field id="reauth-password" label={t("auth.password")}>
            {(aria) => (
              <Input
                {...aria}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            )}
          </Field>
          {needsCode ? (
            <Field id="reauth-code" label={t("auth.login.totpLabel")}>
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
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                close(false);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !password}>
              {t("auth.reauth.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
