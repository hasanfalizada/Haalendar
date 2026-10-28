// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. What an event row of the day list and the agenda shows besides its
// title, taken out of the day list (HAAL-083, D-72): active attachments per item from the local database (one query for
// the whole list, offline too) and the row's flags read as its accessible description.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { localKeys, localRows } from "@/sync";

import type { DayEntry } from "./dayView";

export function useAttachmentCounts(user: string | undefined): Map<string, number> {
  const { data = [] } = useQuery({
    queryKey: [...localKeys.table("attachment"), user ?? ""],
    queryFn: () => (user ? localRows(user, "attachment") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const attachment of data) {
      const itemId = attachment.item_id;
      if (typeof itemId !== "string" || attachment.deleted_at) continue;
      counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
    }
    return counts;
  }, [data]);
}

/** "repeats, has a description, 2 attachments" — what the row's icons show, for screen readers. */
export function useRowFlags(): (entry: DayEntry, attachments: number) => string[] {
  const { t } = useTranslation();
  return (entry, attachments) =>
    [
      entry.recurring ? t("calendar.day.flagRepeats") : null,
      entry.hasDescription ? t("calendar.day.flagDescription") : null,
      attachments > 0 ? t("calendar.day.flagAttachments", { count: attachments }) : null,
    ].filter((flag): flag is string => flag !== null);
}
