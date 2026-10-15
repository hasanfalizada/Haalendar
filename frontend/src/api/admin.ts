// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel queries on the generated client (account data only,
// never content — ADR-0005).
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { adminListInvites, adminListUsers } from "./generated/sdk.gen";
import { ApiError } from "./problem";
import type { AdminUser } from "./generated/types.gen";

export type UserStatus = AdminUser["status"];

export interface UserFilters {
  q: string;
  status: UserStatus | "";
}

export const ADMIN_PAGE_SIZE = 50;

export const adminKeys = {
  all: ["admin"] as const,
  users: (filters: UserFilters) => ["admin", "users", filters] as const,
  invites: ["admin", "invites"] as const,
};

export function adminUsersQuery(filters: UserFilters) {
  return infiniteQueryOptions({
    queryKey: adminKeys.users(filters),
    queryFn: async ({ pageParam }) => {
      const { data, error } = await adminListUsers({
        query: {
          limit: ADMIN_PAGE_SIZE,
          ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      });
      if (error !== undefined) throw new ApiError(error);
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });
}

export const adminInvitesQuery = queryOptions({
  queryKey: adminKeys.invites,
  queryFn: async () => {
    const { data, error } = await adminListInvites();
    if (error !== undefined) throw new ApiError(error);
    return data.data;
  },
  retry: false,
});
