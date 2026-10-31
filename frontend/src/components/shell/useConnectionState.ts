// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Connection state: browser online flag + backend liveness probe
// (healthLive from the generated client, every 60 s). Replaced by the full sync status in HAAL-051/055.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Also drives the offline banner; the sync status joins it in HAAL-052/053.
// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. A sync that gets through while the server counts as unreachable
// checks it again at once (the indicator said "Server unreachable" for up to a minute after the server was back).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { healthLive } from "@/api/generated/sdk.gen";
import { log } from "@/lib/log";
import { useSyncStatus } from "@/sync";

export type ConnectionState = "online" | "offline" | "serverUnreachable" | "checking";

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useConnectionState(): ConnectionState {
  const browserOnline = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const health = useQuery({
    queryKey: ["health", "live"],
    queryFn: async () => {
      const { response } = await healthLive({ throwOnError: false });
      if (!response?.ok) {
        log.warn("health_live_failed", { status: response?.status ?? "network_error" });
        throw new Error(`health ${String(response?.status ?? "network_error")}`);
      }
      return true;
    },
    enabled: browserOnline,
    refetchInterval: 60_000,
    retry: 1,
  });
  const { lastSyncAt } = useSyncStatus();
  const seenSync = useRef(lastSyncAt);
  const { isError: unreachable, refetch } = health;
  useEffect(() => {
    if (lastSyncAt === seenSync.current) return;
    seenSync.current = lastSyncAt;
    if (unreachable) void refetch();
  }, [lastSyncAt, unreachable, refetch]);
  if (!browserOnline) return "offline";
  if (health.isPending) return "checking";
  return health.isError ? "serverUnreachable" : "online";
}
