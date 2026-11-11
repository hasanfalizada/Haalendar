// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Router factory; tests pass a memory history.
import { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";

import { localKeys } from "@/sync";

import { routeTree } from "./routeTree.gen";

export function createQueryClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });
  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Reads of the local database need no network: they run while the
  // browser is offline too (TanStack Query pauses queries in its default network mode once the browser goes offline,
  // so a change made offline did not show until the connection was back).
  client.setQueryDefaults(localKeys.all, { networkMode: "always" });
  return client;
}

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    ...(history ? { history } : {}),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
