// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. Shown inside a record's view when it has an unresolved sync conflict
// (ADR-0009: "shown in the item"); leads to Settings → Sync where it is resolved. Used by the module screens.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { meQuery } from "@/api/session";
import { INLINE_LINK } from "@/components/ui/link-styles";
import { useConflicts } from "@/sync/conflicts";

export function ConflictNotice({ entityId }: { entityId: string }) {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const conflicts = useConflicts(me?.id, entityId);
  if (conflicts.length === 0) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-sm bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {t("sync.notice", { count: conflicts.length })}{" "}
        <Link to="/settings" hash="sync" className={INLINE_LINK}>
          {t("sync.resolve")}
        </Link>
      </span>
    </div>
  );
}
