// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Sharing queries on the generated client (FR-ACC-10).
import { queryOptions } from "@tanstack/react-query";

import { listShares } from "./generated/sdk.gen";
import type { ContainerKind } from "./generated/types.gen";
import { ApiError } from "./problem";

export type ShareDirection = "granted" | "received";

export interface ShareFilter {
  direction: ShareDirection;
  containerKind?: ContainerKind;
  containerId?: string;
}

export const sharingKeys = {
  all: ["shares"] as const,
  list: (filter: ShareFilter) => ["shares", filter] as const,
};

export function sharesQuery(filter: ShareFilter) {
  return queryOptions({
    queryKey: sharingKeys.list(filter),
    queryFn: async () => {
      const { data, error } = await listShares({
        query: {
          direction: filter.direction,
          ...(filter.containerKind ? { container_kind: filter.containerKind } : {}),
          ...(filter.containerId ? { container_id: filter.containerId } : {}),
        },
      });
      if (error !== undefined) throw new ApiError(error);
      return data.data;
    },
    retry: false,
  });
}
