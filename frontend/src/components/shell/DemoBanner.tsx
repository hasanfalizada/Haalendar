// +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The banner of the public demo (FR-OPS-03): the time until the next reset
// and that everything here is public. When the time is up it asks the server for the next one and tells the page
// (`onReset`): the session is gone with the old data, so the app goes to the sign-in page. The time is not a live
// region: a screen reader would read it every second.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { demoStatusQuery } from "@/api/demo";
import { cn } from "@/lib/utils";

const RETRY_MS = 5_000;

function timeLeft(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DemoBanner({ className, onReset }: { className?: string; onReset?: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const known = queryClient.getQueryData(demoStatusQuery.queryKey)?.next_reset_at;
  const due = known != null && Date.parse(known) <= now;
  const { data } = useQuery({ ...demoStatusQuery, refetchInterval: due ? RETRY_MS : false });
  const resetAt = data?.demo_mode ? data.next_reset_at : null;

  useEffect(() => {
    if (!resetAt) return undefined;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [resetAt]);

  const previous = useRef(resetAt);
  useEffect(() => {
    if (previous.current && resetAt && previous.current !== resetAt) onReset?.();
    previous.current = resetAt;
  }, [resetAt, onReset]);

  if (!resetAt) return null;
  const left = Date.parse(resetAt) - now;
  return (
    <div className={cn("flex items-start gap-2 bg-primary-tint px-4 py-2 text-[13px] text-fg", className)}>
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>
        {left > 0 ? t("demo.banner", { time: timeLeft(left) }) : t("demo.resetting")} {t("demo.public")}
      </span>
    </div>
  );
}
