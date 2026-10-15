// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Instance settings for administrators: registration mode (invitation
// only / open sign-up) and the 2FA requirement for administrators; SMTP and demo mode are shown read-only (set by the
// deployment). Saves with If-Match and re-authentication.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { adminGetInstanceSettings, adminUpdateInstanceSettings } from "@/api/generated/sdk.gen";
import type { InstanceSettings } from "@/api/generated/types.gen";
import { ApiError, problemCode } from "@/api/problem";
import { REAUTH_CANCELLED, useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";
import { cn } from "@/lib/utils";

const instanceKey = ["admin", "instance-settings"] as const;

export function InstanceSettingsCard() {
  const settings = useQuery({
    queryKey: instanceKey,
    queryFn: async () => {
      const { data, error } = await adminGetInstanceSettings();
      if (error !== undefined) throw new ApiError(error);
      return data;
    },
    retry: false,
  });
  // The notice lives here: the form is re-created for every new settings version.
  const [notice, setNotice] = useState<Notice | null>(null);
  if (!settings.data) return null;
  return <InstanceForm key={settings.data.version} current={settings.data} notice={notice} setNotice={setNotice} />;
}

interface Notice {
  ok: boolean;
  text: string;
}

interface InstanceFormProps {
  current: InstanceSettings;
  notice: Notice | null;
  setNotice: (notice: Notice | null) => void;
}

function InstanceForm({ current, notice, setNotice }: InstanceFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const [mode, setMode] = useState(current.registration_mode);
  const [requireTfa, setRequireTfa] = useState(current.require_admin_2fa);
  const [busy, setBusy] = useState(false);
  const dirty = mode !== current.registration_mode || requireTfa !== current.require_admin_2fa;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await withReauth(() =>
        adminUpdateInstanceSettings({
          headers: { "If-Match": `"${String(current.version)}"` },
          body: {
            ...(mode !== current.registration_mode ? { registration_mode: mode } : {}),
            ...(requireTfa !== current.require_admin_2fa ? { require_admin_2fa: requireTfa } : {}),
          },
        }),
      );
      if (error === REAUTH_CANCELLED) return;
      if (error !== undefined) {
        const code = problemCode(error);
        log.warn("instance_settings_failed", { code });
        setNotice({
          ok: false,
          text:
            code === "invalid_state"
              ? t("admin.instance.ownTfaFirst")
              : code === "version_conflict"
                ? t("admin.errors.changedMeanwhile")
                : t("admin.errors.generic"),
        });
        await queryClient.invalidateQueries({ queryKey: instanceKey });
        return;
      }
      log.info("instance_settings_saved");
      setNotice({ ok: true, text: t("admin.instance.saved") });
      await queryClient.invalidateQueries({ queryKey: instanceKey });
    } catch (err) {
      log.warn("instance_settings_unreachable", { error: describeError(err) });
      setNotice({ ok: false, text: t("auth.offline") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="instance-title" className="mx-4 mt-3 rounded-sm border border-line p-3">
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-3">
        <h2 id="instance-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {t("admin.instance.title")}
        </h2>
        {notice ? (
          <p
            role={notice.ok ? "status" : "alert"}
            className={cn("text-[13px]", notice.ok ? "text-primary" : "text-danger")}
          >
            {notice.text}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field id="instance-registration" label={t("admin.instance.registration")}>
            {(aria) => (
              <Select
                {...aria}
                value={mode}
                className="md:w-56"
                onChange={(e) => {
                  setMode(e.target.value === "open" ? "open" : "invite");
                }}
              >
                <option value="invite">{t("admin.instance.invite")}</option>
                <option value="open">{t("admin.instance.open")}</option>
              </Select>
            )}
          </Field>
          <label className="flex h-9 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={requireTfa}
              onChange={(e) => {
                setRequireTfa(e.target.checked);
              }}
            />
            {t("admin.instance.requireTfa")}
          </label>
          <Button type="submit" variant="primary" disabled={busy || !dirty}>
            {t("admin.instance.save")}
          </Button>
        </div>
        <p className="text-xs text-muted">
          {current.smtp_configured ? t("admin.instance.smtpOn") : t("admin.instance.smtpOff")}
          {current.demo_mode ? ` · ${t("admin.instance.demo")}` : ""}
        </p>
      </form>
    </section>
  );
}
