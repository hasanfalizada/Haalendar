// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Instance settings for administrators: registration mode (invitation
// only / open sign-up) and the 2FA requirement for administrators; SMTP and demo mode are shown read-only (set by the
// deployment). Saves with If-Match and re-authentication.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. The result is reported through runWrite.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. Leaving with unsaved changes asks; Ctrl/Cmd+Enter saves.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { adminGetInstanceSettings, adminUpdateInstanceSettings } from "@/api/generated/sdk.gen";
import type { InstanceSettings } from "@/api/generated/types.gen";
import { ApiError } from "@/api/problem";
import { runWrite } from "@/api/write";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";

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
  if (!settings.data) return null;
  // The form is re-created for every new settings version.
  return <InstanceForm key={settings.data.version} current={settings.data} />;
}

function InstanceForm({ current }: { current: InstanceSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const [mode, setMode] = useState(current.registration_mode);
  const [requireTfa, setRequireTfa] = useState(current.require_admin_2fa);
  const [busy, setBusy] = useState(false);
  const dirty = mode !== current.registration_mode || requireTfa !== current.require_admin_2fa;
  const form = useRef<HTMLFormElement>(null);
  const guard = useUnsavedGuard({
    dirty,
    onDiscard: () => {
      setMode(current.registration_mode);
      setRequireTfa(current.require_admin_2fa);
    },
    scope: form,
    onSave: () => {
      if (dirty && !busy) form.current?.requestSubmit();
    },
  });

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await runWrite({
      name: "instance_settings_save",
      run: () =>
        withReauth(() =>
          adminUpdateInstanceSettings({
            headers: { "If-Match": `"${String(current.version)}"` },
            body: {
              ...(mode !== current.registration_mode ? { registration_mode: mode } : {}),
              ...(requireTfa !== current.require_admin_2fa ? { require_admin_2fa: requireTfa } : {}),
            },
          }),
        ),
      success: t("admin.instance.saved"),
      reasons: (problem) =>
        problem.code === "invalid_state"
          ? t("admin.instance.ownTfaFirst")
          : problem.code === "version_conflict"
            ? t("admin.errors.changedMeanwhile")
            : null,
    });
    setBusy(false);
    if (result.ok || result.code !== "cancelled") await queryClient.invalidateQueries({ queryKey: instanceKey });
  }

  return (
    <section aria-labelledby="instance-title" className="mx-4 mt-3 rounded-sm border border-line p-3">
      <form ref={form} onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-3">
        <h2 id="instance-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {t("admin.instance.title")}
        </h2>
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
      <UnsavedChangesDialog prompt={guard.prompt} />
    </section>
  );
}
