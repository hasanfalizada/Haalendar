// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Trash queries on the generated client.
import { infiniteQueryOptions } from "@tanstack/react-query";

import { listTrash } from "./generated/sdk.gen";
import type { TrashEntry } from "./generated/types.gen";
import { ApiError } from "./problem";

export type TrashModule = TrashEntry["type"];

export const trashKeys = {
  all: ["trash"] as const,
  list: (module: TrashModule | "") => ["trash", module] as const,
};

export function trashQuery(module: TrashModule | "") {
  return infiniteQueryOptions({
    queryKey: trashKeys.list(module),
    queryFn: async ({ pageParam }) => {
      const { data, error } = await listTrash({
        query: { limit: 50, ...(module ? { module } : {}), ...(pageParam ? { cursor: pageParam } : {}) },
      });
      if (error !== undefined) throw new ApiError(error);
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });
}
