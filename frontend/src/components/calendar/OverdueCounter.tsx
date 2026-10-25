// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-068. "N overdue events" under the mini month (FR-CAL-17, F-32, D-68):
// counted from the local rows (offline, follows every change), hidden at zero, announced politely when the number
// changes. "Today" is re-read every minute and when the tab comes back, so the count moves on at midnight by itself.
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { todayIn } from "@/lib/datetime";
import { overdueCount } from "@/lib/overdue";

const RECHECK_MS = 60_000;

function useToday(timeZone: string): string {
  const [today, setToday] = useState(() => todayIn(timeZone));
  useEffect(() => {
    const check = () => {
      setToday(todayIn(timeZone));
    };
    check();
    const timer = setInterval(check, RECHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone]);
  return today;
}

export function OverdueCounter({ rows, viewerTz }: { rows: readonly Record<string, unknown>[]; viewerTz: string }) {
  const { t } = useTranslation();
  const today = useToday(viewerTz);
  const count = overdueCount(rows, today, viewerTz);
  return (
    <p aria-live="polite" className="mt-3 min-h-5 text-[13px]">
      {count > 0 ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-danger">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {t("calendar.overdue", { count })}
        </span>
      ) : null}
    </p>
  );
}
