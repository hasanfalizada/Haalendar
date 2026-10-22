// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. "Sync" in Settings (#sync; FR-OFF-03/04, ADR-0009): the sync
// status, the last successful sync, the changes not sent yet, "Sync now", and every unresolved conflict to resolve.
// Reached from the connection indicator, the notification center (sync_error) and the user menu.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { meQuery } from "@/api/session";
import { Button } from "@/components/ui/button";
import { useInstantFormat } from "@/lib/datetime";
import { localKeys, syncNow, useSyncStatus } from "@/sync";
import { useConflicts } from "@/sync/conflicts";

import { ConflictCard } from "./ConflictCard";

export function SyncSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const format = useInstantFormat();
  const { data: me } = useQuery(meQuery);
  const status = useSyncStatus();
  const conflicts = useConflicts(me?.id);

  return (
    <section
      id="sync"
      tabIndex={-1}
      aria-labelledby="sync-title"
      className="flex scroll-mt-2 flex-col gap-4 border-t border-line p-4 outline-none"
    >
      <h2 id="sync-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("sync.title")}
      </h2>
      <p className="max-w-2xl text-[13px] text-muted">{t("sync.intro")}</p>
      <dl className="grid w-fit grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-muted">{t("sync.state")}</dt>
        <dd>{t(`sync.states.${status.state}`)}</dd>
        <dt className="text-muted">{t("sync.lastSync")}</dt>
        <dd>{status.lastSyncAt ? format.instant(status.lastSyncAt) : t("sync.never")}</dd>
        <dt className="text-muted">{t("sync.pendingLabel")}</dt>
        <dd>{status.pending}</dd>
      </dl>
      <Button className="w-fit" disabled={status.state === "syncing"} onClick={syncNow}>
        <RefreshCw aria-hidden />
        {t("sync.now")}
      </Button>

      <h3 className="text-[13px] font-medium">{t("sync.conflictsTitle", { count: conflicts.length })}</h3>
      {conflicts.length === 0 ? (
        <p className="text-[13px] text-muted">{t("sync.noConflicts")}</p>
      ) : (
        <ul
          aria-label={t("sync.conflictsTitle", { count: conflicts.length })}
          className="flex flex-col divide-y divide-line rounded-sm border border-line"
        >
          {conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              user={me?.id ?? ""}
              conflict={conflict}
              onDone={() => void queryClient.invalidateQueries({ queryKey: localKeys.all })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
