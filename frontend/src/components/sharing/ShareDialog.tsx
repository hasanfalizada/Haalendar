// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. "Share" dialog for one container (calendar now; board and note when
// they exist): invite another user of the instance by e-mail with view or edit permission, change or remove existing
// access. Wired into the calendar list by HAAL-094 and into boards and notes by their tasks.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Failures are shown inside the dialog, successes as notifications.
import { useQuery } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ContainerKind, Permission, Share } from "@/api/generated/types.gen";
import { sharesQuery } from "@/api/sharing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

import { ShareRow } from "./ShareRow";
import { type ActionResult, useShareActions } from "./useShareActions";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  containerKind: ContainerKind;
  containerId: string;
  containerName: string;
}

export function ShareDialog({ open, onClose, containerKind, containerId, containerName }: ShareDialogProps) {
  const { t } = useTranslation();
  const actions = useShareActions("inline");
  const shares = useQuery({
    ...sharesQuery({ direction: "granted", containerKind, containerId }),
    enabled: open,
  });

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<Permission>("view");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!email.trim()) {
      setEmailError(t("auth.required"));
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    const result = await actions.share(containerKind, containerId, email.trim(), permission);
    setBusy(false);
    if (result.ok) {
      setEmail("");
      setPermission("view");
    } else if (result.fieldError) {
      setEmailError(result.fieldError);
    } else if (result.error) {
      setMessage(result.error);
    }
  }

  async function report(promise: Promise<ActionResult>) {
    setMessage(null);
    const result = await promise;
    if (result.error) setMessage(result.error);
  }

  const list: Share[] = shares.data ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        title={t("sharing.dialogTitle", { name: containerName })}
        description={t("sharing.dialogIntro")}
        closeLabel={t("common.close")}
      >
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex-1">
            <Field id="share-email" label={t("auth.email")} error={emailError}>
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
          </div>
          <Field id="share-permission" label={t("sharing.permissionLabel")}>
            {(aria) => (
              <Select
                {...aria}
                value={permission}
                className="md:w-36"
                onChange={(e) => {
                  setPermission(e.target.value === "edit" ? "edit" : "view");
                }}
              >
                <option value="view">{t("sharing.permission.view")}</option>
                <option value="edit">{t("sharing.permission.edit")}</option>
              </Select>
            )}
          </Field>
          <Button type="submit" variant="primary" disabled={busy} className="md:mt-[22px]">
            {t("sharing.share")}
          </Button>
        </form>

        {message ? (
          <p role="alert" className="text-[13px] text-danger">
            {message}
          </p>
        ) : null}

        <section aria-labelledby="share-access" className="flex flex-col gap-2">
          <h3 id="share-access" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
            {t("sharing.peopleWithAccess")}
          </h3>
          {list.length === 0 ? (
            <p className="text-[13px] text-muted">{t("sharing.nobody")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-sm border border-line">
              {list.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  title={share.grantee_name}
                  subtitle={share.grantee_email}
                  mode="owner"
                  onChangePermission={(s, p) => report(actions.changePermission(s, p))}
                  onRemove={(s) => report(actions.revoke(s, "owner"))}
                />
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
