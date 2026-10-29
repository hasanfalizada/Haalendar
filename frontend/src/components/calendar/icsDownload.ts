// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. Saves a calendar's .ics file (FR-CAL-33, D-83): a download from the
// server (export.ics answers as an attachment named after the calendar); without a connection the user is told.
import i18n from "@/i18n";
import { notify } from "@/lib/notify";

export function downloadIcs(calendar: Record<string, unknown>): void {
  if (!navigator.onLine) {
    notify.failure(i18n.t("ics.offline"));
    return;
  }
  const link = document.createElement("a");
  link.href = `/api/v1/calendars/${String(calendar.id)}/export.ics`;
  link.download = "";
  document.body.append(link);
  link.click();
  link.remove();
}
