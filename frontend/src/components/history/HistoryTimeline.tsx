// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. History of a record from the audit log (FR-X-03), newest first:
// who did what and when, and for changes the fields "before → after". Used by item details (HAAL-064) and the card
// activity (HAAL-114); the server limits records to what the viewer may read.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Times follow the 12/24-hour setting (useInstantFormat).
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AuditRecord } from "@/api/generated/types.gen";
import { meQuery } from "@/api/session";
import { displayValue, fieldLabel } from "@/lib/audit-format";
import { useInstantFormat } from "@/lib/datetime";

interface HistoryTimelineProps {
  records: AuditRecord[];
  now?: Date;
}

export function HistoryTimeline({ records, now }: HistoryTimelineProps) {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const format = useInstantFormat();
  const reference = now ?? new Date();

  if (records.length === 0) return <p className="text-[13px] text-muted">{t("history.empty")}</p>;
  return (
    <ol className="flex flex-col gap-3" aria-label={t("history.title")}>
      {records.map((record) => {
        const actor =
          record.actor_id && record.actor_id === me?.id ? t("history.you") : (record.actor_name ?? t("history.system"));
        const changes = record.action === "create" || !record.after ? [] : Object.keys(record.after);
        return (
          <li key={record.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
            <span className="text-[13px]">
              <span className="font-medium">{actor}</span> {t(`history.actions.${record.action}`)}
              <span className="text-muted">
                {" · "}
                <time dateTime={record.occurred_at} title={format.instant(record.occurred_at)}>
                  {format.relative(record.occurred_at, reference)}
                </time>
              </span>
            </span>
            {changes.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-xs text-muted">
                {changes.map((field) => (
                  <li key={field}>
                    <span className="text-fg">{fieldLabel(field)}:</span>{" "}
                    {displayValue(record.before?.[field], t("history.emptyValue"))} →{" "}
                    {displayValue(record.after?.[field], t("history.emptyValue"))}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
