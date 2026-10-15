// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Invite a user: with SMTP an invitation e-mail is sent; without SMTP
// the account is created at once and the one-time password is handed to the caller to show.
import { useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { adminKeys } from "@/api/admin";
import { adminInviteUser } from "@/api/generated/sdk.gen";
import { fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";

import { useAdminErrorText } from "./admin-errors";
import type { OneTimePassword } from "./OneTimePasswordDialog";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onSent: (email: string) => void;
  onAccountCreated: (value: OneTimePassword) => void;
}

export function InviteDialog({ open, onClose, onSent, onAccountCreated }: InviteDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const errorText = useAdminErrorText();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [name, setName] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setEmail("");
    setRole("user");
    setName("");
    setEmailError(undefined);
    setFormError(null);
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!email.trim()) {
      setEmailError(t("auth.required"));
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    const idempotencyKey = crypto.randomUUID(); // the same key for the retry after re-authentication
    try {
      const result = await withReauth(() =>
        adminInviteUser({
          body: { email: email.trim(), role, ...(name.trim() ? { display_name: name.trim() } : {}) },
          headers: { "Idempotency-Key": idempotencyKey },
        }),
      );
      if (result.error !== undefined || result.data === undefined) {
        const code = problemCode(result.error);
        log.warn("admin_invite_failed", { code });
        if (code === "duplicate") setEmailError(t("admin.invite.duplicate"));
        else if (code === "validation_failed" && isProblem(result.error))
          setEmailError(fieldErrorsOf(result.error)[0]?.detail ?? t("admin.errors.generic"));
        else setFormError(errorText(result.error));
        return;
      }
      const created = result.data;
      log.info("admin_invite_sent", { delivery: created.delivery });
      await queryClient.invalidateQueries({ queryKey: adminKeys.all });
      reset();
      onClose();
      if (created.delivery === "one_time_password" && created.one_time_password) {
        onAccountCreated({ email: created.user?.email ?? email.trim(), password: created.one_time_password });
      } else {
        onSent(created.invite?.email ?? email.trim());
      }
    } catch (err) {
      log.warn("admin_invite_unreachable", { error: describeError(err) });
      setFormError(t("auth.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent
        title={t("admin.invite.title")}
        description={t("admin.invite.intro")}
        closeLabel={t("common.close")}
      >
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-[13px] text-danger">
              {formError}
            </p>
          ) : null}
          <Field id="invite-email-input" label={t("auth.email")} error={emailError}>
            {(aria) => (
              <Input
                {...aria}
                type="email"
                autoComplete="off"
                maxLength={254}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            )}
          </Field>
          <Field id="invite-role" label={t("admin.columns.role")}>
            {(aria) => (
              <Select
                {...aria}
                value={role}
                onChange={(e) => {
                  setRole(e.target.value === "admin" ? "admin" : "user");
                }}
              >
                <option value="user">{t("admin.role.user")}</option>
                <option value="admin">{t("admin.role.admin")}</option>
              </Select>
            )}
          </Field>
          <Field id="invite-name-input" label={t("admin.invite.name")} hint={t("admin.invite.nameHint")}>
            {(aria) => (
              <Input
                {...aria}
                maxLength={80}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <DialogFooter>
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("admin.invite.submitting") : t("admin.invite.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
