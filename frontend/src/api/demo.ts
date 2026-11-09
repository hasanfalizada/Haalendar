// +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The public demo (FR-OPS-03): is this one, when is the next reset, which
// accounts to sign in with. On any other instance it answers only that it is not a demo.
import { queryOptions, useQuery } from "@tanstack/react-query";

import { getDemoStatus } from "./generated/sdk.gen";

export const demoStatusQuery = queryOptions({
  queryKey: ["demo", "status"],
  queryFn: async () => {
    const { data } = await getDemoStatus({ throwOnError: true });
    return data;
  },
  staleTime: Infinity,
  retry: false,
});

export function useIsDemo(): boolean {
  const { data } = useQuery(demoStatusQuery);
  return data?.demo_mode === true;
}
