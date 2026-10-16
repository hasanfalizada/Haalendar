// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Invite a user: with SMTP an invitation e-mail is sent; without SMTP
// the account is created at once and the one-time password is handed to the caller to show.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Through runWrite: a failure is shown inside the open dialog (a toast
// would sit behind the modal), the success as a notification once the dialog has closed.
import { useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { adminKeys } from "@/api/admin";
import { adminInviteUser } from "@/api/generated/sdk.gen";
import { runWrite } from "@/api/write";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

import { useAdminReasons } from "./admin-errors";
import type { OneTimePassword } from "./OneTimePasswordDialog";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onAccountCreated: (value: OneTimePassword) => void;
}

export function InviteDialog({ open, onClose, onAccountCreated }: InviteDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const adminReasons = useAdminReasons();

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
    const address = email.trim();
    const result = await runWrite({
      name: "admin_invite",
      run: () =>
        withReauth(() =>
          adminInviteUser({
            body: { email: address, role, ...(name.trim() ? { display_name: name.trim() } : {}) },
            headers: { "Idempotency-Key": idempotencyKey },
          }),
        ),
      failure: "inline",
      success: (created) =>
        created.delivery === "one_time_password"
          ? t("admin.results.accountCreated", { email: created.user?.email ?? address })
          : t("admin.results.invited", { email: created.invite?.email ?? address }),
      reasons: (problem) => (problem.code === "duplicate" ? t("admin.invite.duplicate") : adminReasons(problem)),
      onFieldErrors: (errors) => {
        setEmailError(errors[0]?.detail);
      },
    });
    setBusy(false);
    if (result.ok) {
      const created = result.data;
      await queryClient.invalidateQueries({ queryKey: adminKeys.all });
      reset();
      onClose();
      if (created.delivery === "one_time_password" && created.one_time_password) {
        onAccountCreated({ email: created.user?.email ?? address, password: created.one_time_password });
      }
    } else if (result.code === "duplicate") {
      setEmailError(result.reason ?? undefined);
    } else if (result.code !== "validation_failed" || !result.problem?.errors?.length) {
      setFormError(result.reason);
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
