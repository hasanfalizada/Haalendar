// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. State of the notification center (FR-X-21, D-52): the server's
// notifications (pages of 20, checked every 60 s) merged with this device's own (sync errors), newest first, and one
// unread count for the badge. Marking read goes through runWrite: a failure is reported, success shows in the list.
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { markNotificationsRead } from "@/api/generated/sdk.gen";
import type { Notification } from "@/api/generated/types.gen";
import { notificationKeys, notificationsQuery } from "@/api/notifications";
import { meQuery } from "@/api/session";
import { runWrite } from "@/api/write";
import {
  type LocalNotification,
  listLocalNotifications,
  markLocalNotificationsRead,
  subscribeLocalNotifications,
} from "@/lib/localNotifications";

/** Badge text: the count, or 99+. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export type CenterItem =
  (Notification & { source: "server" }) | (LocalNotification & { source: "local"; item_id?: null });

export function useNotificationCenter() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const user = me?.id ?? null;
  const query = useInfiniteQuery({ ...notificationsQuery, enabled: Boolean(user) });
  // Local notifications are kept with the user they were read for, so another user never sees them.
  const [loaded, setLoaded] = useState<{ user: string; notes: LocalNotification[] } | null>(null);
  const local = useMemo(() => (loaded && loaded.user === user ? loaded.notes : []), [loaded, user]);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const load = () => {
      void listLocalNotifications(user).then((notes) => {
        if (alive) setLoaded({ user, notes });
      });
    };
    load();
    const stop = subscribeLocalNotifications(load);
    return () => {
      alive = false;
      stop();
    };
  }, [user]);

  const items = useMemo<CenterItem[]>(() => {
    const server: CenterItem[] = (query.data?.pages ?? []).flatMap((page) =>
      page.data.map((n) => ({ ...n, source: "server" as const })),
    );
    const mine: CenterItem[] = local.map((n) => ({ ...n, source: "local" as const }));
    return [...server, ...mine].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [query.data, local]);

  const serverUnread = query.data?.pages[0]?.unread_count ?? 0;
  const unread = serverUnread + local.filter((n) => n.read_at === null).length;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  }

  async function markRead(item: CenterItem) {
    if (item.read_at || !user) return;
    if (item.source === "local") {
      await markLocalNotificationsRead(user, [item.id]);
      return;
    }
    await runWrite({
      name: "notification_read",
      run: () => markNotificationsRead({ body: { ids: [item.id] } }),
      success: () => null, // the item turns read in the list; only a failure needs a notification
      retry: false,
      onSuccess: refresh,
    });
  }

  async function markAllRead() {
    if (!user) return;
    if (local.some((n) => n.read_at === null)) await markLocalNotificationsRead(user);
    if (serverUnread > 0) {
      await runWrite({
        name: "notifications_read_all",
        run: () => markNotificationsRead({ body: { all: true } }),
        success: () => null,
        onSuccess: refresh,
      });
    }
  }

  return {
    items,
    unread,
    isLoading: query.isLoading,
    isError: query.isError && items.length === 0,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
    markRead,
    markAllRead,
  };
}
