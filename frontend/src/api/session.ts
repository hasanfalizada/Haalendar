// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Current session: GET /me is the single source of "who is signed in".
// null = not signed in (401); a thrown error = server unreachable (callers stay offline-tolerant). The CSRF token of
// the session is taken from /me and kept in memory only (ADR-0005).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Signing out also deletes the user's local drafts (D-39).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. …and the undo history of this tab.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. …and the notifications kept on this device.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Starting without the server (FR-OFF-01, D-55): when the server cannot
// be reached (no answer, or 502/503/504 from the proxy) the last profile on this device stands in, without a CSRF
// token; it counts as stale at once and is checked again every 30 s and on reconnect, so the live session (and its
// token) replaces it as soon as the server answers. Signing out forgets the stored profile.
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { setCsrfToken } from "./client";
import { getMe, logout } from "./generated/sdk.gen";
import { ApiError } from "./problem";
import type { Me } from "./generated/types.gen";
import { wipeDrafts } from "@/lib/drafts";
import { cachedProfile, forgetProfile, rememberProfile } from "@/lib/profileCache";
import { wipeLocalNotifications } from "@/lib/localNotifications";
import { bindUndoUser } from "@/lib/undo";
import { disablePush } from "@/lib/push";
import { describeError, log } from "@/lib/log";
import { wipeLocalStore } from "@/sync";

export const meQueryKey = ["session", "me"] as const;

const UNREACHABLE = new Set([502, 503, 504]);

/** The stored profile when the server cannot be reached; without one the failure stands. */
async function offlineProfile(reason: string): Promise<Me> {
  const stored = await cachedProfile();
  if (!stored) throw new Error(`GET /me: ${reason}`);
  log.info("profile_from_device", { reason });
  return stored; // stored without csrf_token
}

/** A profile from this device (no live session token yet). */
export function isDeviceProfile(me: Me | null | undefined): boolean {
  return Boolean(me && !me.csrf_token);
}

export const meQuery = queryOptions({
  queryKey: meQueryKey,
  queryFn: async (): Promise<Me | null> => {
    let answer: Awaited<ReturnType<typeof getMe>>;
    try {
      answer = await getMe();
    } catch (error) {
      log.warn("me_unreachable", { error: describeError(error) });
      return offlineProfile("server unreachable");
    }
    const { data, error, response } = answer;
    if (!response) return offlineProfile("server unreachable");
    if (UNREACHABLE.has(response.status)) return offlineProfile(`status ${String(response.status)}`);
    if (response.status === 401) {
      setCsrfToken(null);
      return null;
    }
    if (error !== undefined) throw new ApiError(error);
    setCsrfToken(data.csrf_token ?? null);
    void rememberProfile(data);
    return data;
  },
  staleTime: (query) => (isDeviceProfile(query.state.data) ? 0 : 5 * 60_000),
  refetchInterval: (query) => (isDeviceProfile(query.state.data) ? 30_000 : false),
  retry: false,
});

/** Store a freshly created session (login, setup, invitation) without another round trip. */
export function rememberSession(queryClient: QueryClient, me: Me, csrfToken: string): void {
  setCsrfToken(csrfToken);
  queryClient.setQueryData(meQueryKey, { ...me, csrf_token: csrfToken });
  void rememberProfile(me);
}

/** Sign out: revoke the server session, forget the CSRF token and wipe all cached data on this device (ADR-0005). */
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The local database with the outbox goes too (the caller has synced
// and confirmed first: useSignOut).
export async function signOut(queryClient: QueryClient): Promise<void> {
  const user = queryClient.getQueryData<Me | null>(meQueryKey)?.id;
  // +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. This browser stops receiving the user's reminders (while the
  // session still works); quietly, signing out goes on whatever happens.
  if (user) await disablePush(user, "sign_out").catch(() => undefined);
  try {
    await logout();
  } catch (error) {
    log.warn("logout_unreachable", { error: describeError(error) });
  }
  setCsrfToken(null);
  if (user) {
    await wipeDrafts(user);
    await wipeLocalNotifications(user);
    await wipeLocalStore(user);
  }
  await forgetProfile();
  bindUndoUser(null);
  queryClient.clear();
  queryClient.setQueryData(meQueryKey, null);
  log.info("signed_out");
}

/** Only same-origin paths are accepted as post-login targets (no open redirect). */
export function safeRedirect(target: unknown): string {
  return typeof target === "string" && target.startsWith("/") && !target.startsWith("//") ? target : "/calendar";
}
