// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Unobtrusive notice when the device's time zone differs from the
// profile's (e.g. while travelling): times stay in the profile zone; "Use <device zone>" updates the profile,
// "Keep" hides the notice for this pair of zones on this device.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. The result of "Use <zone>" is reported through runWrite.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { updateProfile } from "@/api/generated/sdk.gen";
import { meQuery, meQueryKey, rememberSession } from "@/api/session";
import { runWrite } from "@/api/write";
import { browserTimeZone } from "@/components/auth/timezone";
import { Button } from "@/components/ui/button";
import { canonicalZone } from "@/lib/datetime";
import { log } from "@/lib/log";

const DISMISSED_KEY = "haalendar.tzMismatchDismissed";

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value: string): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, value);
  } catch {
    // Storage unavailable (private mode): the notice simply shows again next time.
  }
}

export function TimeZoneMismatch() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);

  if (!me?.time_zone) return null;
  const device = canonicalZone(browserTimeZone());
  const profile = canonicalZone(me.time_zone);
  const pair = `${device}|${profile}`;
  if (device === profile || dismissed === pair) return null;

  async function switchToDevice() {
    if (!me) return;
    setBusy(true);
    const current = me;
    const result = await runWrite({
      name: "tz_switch_to_device",
      run: () =>
        updateProfile({ headers: { "If-Match": `"${String(current.version)}"` }, body: { time_zone: device } }),
      success: t("timeZone.switched", { zone: device }),
      onSuccess: (data) => {
        rememberSession(queryClient, data, data.csrf_token ?? current.csrf_token ?? "");
      },
    });
    setBusy(false);
    if (!result.ok && result.code === "version_conflict") await queryClient.invalidateQueries({ queryKey: meQueryKey });
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 text-[13px]"
    >
      <span className="min-w-0 flex-1">{t("timeZone.mismatch", { device, profile })}</span>
      <Button variant="primary" disabled={busy} onClick={() => void switchToDevice()}>
        {t("timeZone.useDevice", { zone: device })}
      </Button>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => {
          writeDismissed(pair);
          setDismissed(pair);
          log.info("tz_mismatch_kept");
        }}
      >
        {t("timeZone.keep", { zone: profile })}
      </Button>
    </div>
  );
}
