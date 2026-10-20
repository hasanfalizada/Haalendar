// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Notifications of the signed-in user (FR-X-21, D-52), newest first in
// pages of 20 with the unread count. Until live updates exist (SSE, HAAL-055) the list is checked every 60 seconds
// while the tab is visible and again whenever the user comes back to it. An answer of the wrong shape is a load error
// (the bell shows nothing, the panel says so) instead of breaking the page.
import { infiniteQueryOptions } from "@tanstack/react-query";

import { listNotifications } from "./generated/sdk.gen";
import type { ListNotificationsResponse } from "./generated/types.gen";
import { ApiError } from "./problem";

export const notificationKeys = { all: ["session", "notifications"] as const };
export const NOTIFICATION_PAGE = 20;
export const NOTIFICATION_POLL_MS = 60_000;

export const notificationsQuery = infiniteQueryOptions({
  queryKey: notificationKeys.all,
  queryFn: async ({ pageParam }): Promise<ListNotificationsResponse> => {
    const { data, error } = await listNotifications({
      query: { limit: NOTIFICATION_PAGE, ...(pageParam ? { cursor: pageParam } : {}) },
    });
    if (error !== undefined) throw new ApiError(error);
    if (!Array.isArray(data.data)) throw new Error("GET /notifications: unexpected answer");
    return data;
  },
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.next_cursor ?? null,
  refetchInterval: NOTIFICATION_POLL_MS,
  refetchOnWindowFocus: true,
});
