// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Created / updated / deleted times of a record (FR-X-02) for detail
// views and the trash: relative for recent changes, exact date and time in the tooltip and in <time datetime>, in the
// profile's time zone. The actor is named only when it is the current user ("by you"); other people's names arrive
// with the audit history (HAAL-032). "Updated" is omitted while it equals "created".
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Callers that know a name (the trash: deleted_by_name) pass it.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Times follow the 12/24-hour setting (useInstantFormat).
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { meQuery } from "@/api/session";
import { useInstantFormat } from "@/lib/datetime";

export interface RecordTimes {
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
}

interface RecordTimestampsProps {
  record: RecordTimes;
  /** Reference time for relative labels (tests); defaults to now. */
  now?: Date;
  /** Known actor names per row, shown as "by <name>" when the actor is someone else. */
  names?: Partial<Record<"created" | "updated" | "deleted", string | null>>;
  className?: string;
}

const SAME_MOMENT_MS = 60_000;

export function RecordTimestamps({ record, now, names, className }: RecordTimestampsProps) {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const format = useInstantFormat();
  const reference = now ?? new Date();

  const rows: { key: "created" | "updated" | "deleted"; iso: string; actor?: string | null | undefined }[] = [
    { key: "created", iso: record.created_at, actor: record.created_by },
  ];
  const changedLater = new Date(record.updated_at).getTime() - new Date(record.created_at).getTime() >= SAME_MOMENT_MS;
  // While a record is deleted, updated_by is the person who deleted it (soft_delete), so it belongs to that row.
  if (changedLater && !record.deleted_at)
    rows.push({ key: "updated", iso: record.updated_at, actor: record.updated_by });
  if (record.deleted_at) rows.push({ key: "deleted", iso: record.deleted_at, actor: record.updated_by });

  return (
    <dl className={className ?? "flex flex-col gap-0.5 text-xs text-muted"}>
      {rows.map((row) => (
        <div key={row.key} className="flex gap-1">
          <dt>{t(`records.${row.key}`)}</dt>
          <dd>
            <time dateTime={row.iso} title={format.instant(row.iso)}>
              {format.relative(row.iso, reference)}
            </time>
            {me && row.actor && row.actor === me.id
              ? ` ${t("records.byYou")}`
              : names?.[row.key]
                ? ` ${t("records.by", { name: names[row.key] })}`
                : ""}
          </dd>
        </div>
      ))}
    </dl>
  );
}
