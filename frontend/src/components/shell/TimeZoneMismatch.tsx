// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Unobtrusive notice when the device's time zone differs from the
// profile's (e.g. while travelling): times stay in the profile zone; "Use <device zone>" updates the profile,
// "Keep" hides the notice for this pair of zones on this device.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { updateProfile } from "@/api/generated/sdk.gen";
import { problemCode } from "@/api/problem";
import { meQuery, meQueryKey, rememberSession } from "@/api/session";
import { browserTimeZone } from "@/components/auth/timezone";
import { Button } from "@/components/ui/button";
import { canonicalZone } from "@/lib/datetime";
import { describeError, log } from "@/lib/log";

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
  const [failed, setFailed] = useState(false);

  if (!me?.time_zone) return null;
  const device = canonicalZone(browserTimeZone());
  const profile = canonicalZone(me.time_zone);
  const pair = `${device}|${profile}`;
  if (device === profile || dismissed === pair) return null;

  async function switchToDevice() {
    if (!me) return;
    setBusy(true);
    setFailed(false);
    try {
      const { data, error } = await updateProfile({
        headers: { "If-Match": `"${String(me.version)}"` },
        body: { time_zone: device },
      });
      if (error !== undefined) {
        log.warn("tz_switch_failed", { code: problemCode(error) });
        await queryClient.invalidateQueries({ queryKey: meQueryKey });
        setFailed(true);
        return;
      }
      log.info("tz_switched_to_device");
      rememberSession(queryClient, data, data.csrf_token ?? me.csrf_token ?? "");
    } catch (err) {
      log.warn("tz_switch_unreachable", { error: describeError(err) });
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2 text-[13px]"
    >
      <span className="min-w-0 flex-1">
        {failed ? t("timeZone.failed") : t("timeZone.mismatch", { device, profile })}
      </span>
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
