// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. A reminder that fires while the app is open (D-79) also shows as a
// message with "Open" (the day with the event's card; the notification is marked read). The notifications list comes
// live over the stream (D-59) or by its regular check; what was already there when the app started stays in the
// center only. Mounted once, in the app shell.
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { markNotificationsRead } from "@/api/generated/sdk.gen";
import { notificationKeys, notificationsQuery } from "@/api/notifications";
import { runWrite } from "@/api/write";
import { useDisplayTimeZone } from "@/lib/datetime";
import { log } from "@/lib/log";
import { notify } from "@/lib/notify";

import { reminderTarget, useReminderText } from "./reminderText";

export function useReminderToasts(user: string | null): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewerTz = useDisplayTimeZone();
  const text = useReminderText();
  const query = useInfiniteQuery({ ...notificationsQuery, enabled: Boolean(user) });
  const seen = useRef<Set<string> | null>(null);
  const newest = query.data?.pages[0]?.data;

  useEffect(() => {
    if (!newest) return;
    if (seen.current === null) {
      seen.current = new Set(newest.map((note) => note.id)); // there before: no message
      return;
    }
    for (const note of newest) {
      if (seen.current.has(note.id)) continue;
      seen.current.add(note.id);
      if (note.kind !== "reminder" || note.read_at) continue;
      const payload = note.payload as Record<string, unknown>;
      const target = reminderTarget(payload, viewerTz);
      log.info("reminder_shown", { while_open: true });
      notify.reminder(text(payload), {
        label: t("reminders.open"),
        run: () => {
          void runWrite({
            name: "notification_read",
            run: () => markNotificationsRead({ body: { ids: [note.id] } }),
            success: () => null, // the center shows it read; only a failure needs a message
            retry: false,
            onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
          });
          if (target) void navigate({ to: "/calendar", search: target });
        },
      });
    }
  }, [newest, viewerTz, text, t, navigate, queryClient]);
}
