// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Current session: GET /me is the single source of "who is signed in".
// null = not signed in (401); a thrown error = server unreachable (callers stay offline-tolerant). The CSRF token of
// the session is taken from /me and kept in memory only (ADR-0005).
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { setCsrfToken } from "./client";
import { getMe, logout } from "./generated/sdk.gen";
import { ApiError } from "./problem";
import type { Me } from "./generated/types.gen";
import { describeError, log } from "@/lib/log";

export const meQueryKey = ["session", "me"] as const;

export const meQuery = queryOptions({
  queryKey: meQueryKey,
  queryFn: async (): Promise<Me | null> => {
    const { data, error, response } = await getMe();
    if (!response) throw new Error("GET /me: server unreachable");
    if (response.status === 401) {
      setCsrfToken(null);
      return null;
    }
    if (error !== undefined) throw new ApiError(error);
    setCsrfToken(data.csrf_token ?? null);
    return data;
  },
  staleTime: 5 * 60_000,
  retry: false,
});

/** Store a freshly created session (login, setup, invitation) without another round trip. */
export function rememberSession(queryClient: QueryClient, me: Me, csrfToken: string): void {
  setCsrfToken(csrfToken);
  queryClient.setQueryData(meQueryKey, { ...me, csrf_token: csrfToken });
}

/** Sign out: revoke the server session, forget the CSRF token and wipe all cached data on this device (ADR-0005). */
export async function signOut(queryClient: QueryClient): Promise<void> {
  try {
    await logout();
  } catch (error) {
    log.warn("logout_unreachable", { error: describeError(error) });
  }
  setCsrfToken(null);
  queryClient.clear();
  queryClient.setQueryData(meQueryKey, null);
  log.info("signed_out");
}

/** Only same-origin paths are accepted as post-login targets (no open redirect). */
export function safeRedirect(target: unknown): string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//") ? target : "/calendar";
}
