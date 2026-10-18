// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. Export requests on the generated client. While one is queued or
// running the list is polled every 3 seconds (the archive is built by the background worker).
import { queryOptions } from "@tanstack/react-query";

import { listExports } from "./generated/sdk.gen";
import type { ExportRequest } from "./generated/types.gen";
import { ApiError } from "./problem";

export const exportKeys = { all: ["exports"] as const };

export function isPending(request: ExportRequest): boolean {
  return request.status === "queued" || request.status === "running";
}

export const exportsQuery = queryOptions({
  queryKey: exportKeys.all,
  queryFn: async (): Promise<ExportRequest[]> => {
    const { data, error } = await listExports();
    if (error !== undefined) throw new ApiError(error);
    return data.data;
  },
  refetchInterval: (query) => (query.state.data?.some(isPending) ? 3_000 : false),
});
