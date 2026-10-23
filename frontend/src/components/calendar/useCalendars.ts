// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. The user's calendars from the local database, shared by the event
// editor and the details card: every visible calendar by id (for its name) and those the user may add to or change
// events in — own ones and those shared with "edit" (the server checks again).
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { localKeys, localRows } from "@/sync";

export type CalendarRow = Record<string, unknown>;

export interface Calendars {
  byId: ReadonlyMap<string, CalendarRow>;
  writable: CalendarRow[];
  canWrite: (calendarId: unknown) => boolean;
}

export function useCalendars(user: string | undefined): Calendars {
  const rows = (entity: "calendar" | "share") => ({
    queryKey: [...localKeys.table(entity), user ?? ""],
    queryFn: () => (user ? localRows(user, entity) : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: calendars = [] } = useQuery(rows("calendar"));
  const { data: shares = [] } = useQuery(rows("share"));
  return useMemo(() => {
    const editable = new Set(
      shares
        .filter((s) => s.grantee_id === user && s.permission === "edit" && !s.revoked_at)
        .map((s) => s.container_id),
    );
    const visible = calendars.filter((c) => !c.deleted_at);
    const writableIds = new Set(visible.filter((c) => c.owner_id === user || editable.has(c.id)).map((c) => c.id));
    return {
      byId: new Map(visible.map((c) => [String(c.id), c])),
      writable: visible
        .filter((c) => writableIds.has(c.id) && !c.archived_at)
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
      canWrite: (calendarId: unknown) => writableIds.has(calendarId),
    };
  }, [calendars, shares, user]);
}
