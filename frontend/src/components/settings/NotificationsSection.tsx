// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). Settings → Browser notifications (#notifications, D-79):
// reminders as notifications of this browser, also when Haalendar is closed. Per device: on / off, or why it is not
// possible (blocked in the browser's site settings, or not supported here).
import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";

import { meQuery } from "@/api/session";
import { Button } from "@/components/ui/button";
import { usePush } from "@/lib/usePush";

export function NotificationsSection() {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const push = usePush(me?.id);

  return (
    <section
      id="notifications"
      tabIndex={-1}
      aria-labelledby="notifications-title"
      className="flex scroll-mt-2 flex-col gap-3 border-t border-line p-4 outline-none"
    >
      <h2 id="notifications-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("push.title")}
      </h2>
      <p className="max-w-2xl text-[13px] text-muted">{t("push.intro")}</p>
      {push.state === null ? null : push.state === "unsupported" ? (
        <p className="text-[13px]">{t("push.unsupported")}</p>
      ) : push.state === "blocked" ? (
        <p className="text-[13px]">{t("push.blocked")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px]" aria-live="polite">
            {t(push.state === "on" ? "push.stateOn" : "push.stateOff")}
          </span>
          {push.state === "on" ? (
            <Button disabled={push.busy} onClick={() => void push.disable()}>
              <BellOff aria-hidden />
              {t("push.turnOff")}
            </Button>
          ) : (
            <Button variant="primary" disabled={push.busy} onClick={() => void push.enable()}>
              <BellRing aria-hidden />
              {/* The browser's first registration with its push service can take a while. */}
              {t(push.busy ? "push.turningOn" : "push.turnOn")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
