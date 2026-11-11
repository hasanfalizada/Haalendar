// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. The user's calendars from the local database, shared by the event
// editor and the details card: every visible calendar by id (for its name) and those the user may add to or change
// events in — own ones and those shared with "edit" (the server checks again).
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Multiple calendars (FR-CAL-32, D-82): the lists of the calendar
// sidebar — own, shared with the user, archived —, the default calendar (first among the writable ones, where new
// events go), the user's hidden calendars (setting `hidden_calendars`: the synced settings row of the local database,
// the settings answer until it has arrived) and `shown` — what the calendar views show: not archived, not hidden. An
// archived calendar is read-only for everyone.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useSettings } from "@/api/settings";
import { localKeys, localRows } from "@/sync";

export type CalendarRow = Record<string, unknown>;

export interface Calendars {
  byId: ReadonlyMap<string, CalendarRow>;
  writable: CalendarRow[];
  canWrite: (calendarId: unknown) => boolean;
  /** Own active calendars, the default first, then by name. */
  own: CalendarRow[];
  /** Calendars shared with the user, by name. */
  shared: CalendarRow[];
  /** Own archived calendars, by name. */
  archived: CalendarRow[];
  defaultId: string | null;
  hidden: ReadonlySet<string>;
  /** Whether the calendar views show this calendar's events. */
  shown: (calendarId: unknown) => boolean;
}

const byName = (a: CalendarRow, b: CalendarRow) => String(a.name).localeCompare(String(b.name));

export function useCalendars(user: string | undefined): Calendars {
  const rows = (entity: "calendar" | "share" | "settings") => ({
    queryKey: [...localKeys.table(entity), user ?? ""],
    queryFn: () => (user ? localRows(user, entity) : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: calendars = [] } = useQuery(rows("calendar"));
  const { data: shares = [] } = useQuery(rows("share"));
  const { data: settingsRows = [] } = useQuery(rows("settings"));
  const { hidden_calendars: fromServer } = useSettings();
  const stored = settingsRows.find((row) => row.owner_id === user)?.hidden_calendars;
  const hiddenList = Array.isArray(stored) ? (stored as unknown[]).map(String) : fromServer;
  const hiddenKey = hiddenList.join(",");
  return useMemo(() => {
    const hidden = new Set(hiddenKey ? hiddenKey.split(",") : []);
    const editable = new Set(
      shares
        .filter((s) => s.grantee_id === user && s.permission === "edit" && !s.revoked_at)
        .map((s) => s.container_id),
    );
    const visible = calendars.filter((c) => !c.deleted_at);
    const live = visible.filter((c) => !c.archived_at);
    const writableIds = new Set(live.filter((c) => c.owner_id === user || editable.has(c.id)).map((c) => c.id));
    const defaultRow = live.find((c) => c.owner_id === user && c.is_default === true);
    const defaultFirst = (a: CalendarRow, b: CalendarRow) =>
      Number(b === defaultRow) - Number(a === defaultRow) || byName(a, b);
    const byId = new Map(visible.map((c) => [String(c.id), c]));
    return {
      byId,
      writable: live.filter((c) => writableIds.has(c.id)).sort(defaultFirst),
      canWrite: (calendarId: unknown) => writableIds.has(calendarId),
      own: live.filter((c) => c.owner_id === user).sort(defaultFirst),
      shared: live.filter((c) => c.owner_id !== user).sort(byName),
      archived: visible.filter((c) => c.owner_id === user && c.archived_at).sort(byName),
      defaultId: defaultRow ? String(defaultRow.id) : null,
      hidden,
      shown: (calendarId: unknown) => {
        // A calendar not (yet) in the local database is shown: only what is known to be archived or hidden leaves.
        const calendar = byId.get(String(calendarId));
        return !calendar?.archived_at && !hidden.has(String(calendarId));
      },
    };
  }, [calendars, shares, user, hiddenKey]);
}
