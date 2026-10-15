// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. First-run setup queries on the generated client.
import { queryOptions } from "@tanstack/react-query";

import { getSetupStatus } from "./generated/sdk.gen";

export const setupStatusQuery = queryOptions({
  queryKey: ["setup", "status"],
  queryFn: async () => {
    const { data } = await getSetupStatus({ throwOnError: true });
    return data;
  },
  staleTime: 60_000,
  retry: false,
});
