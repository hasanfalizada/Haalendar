// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). Browser notifications for reminders on this device
// (FR-CAL-29, D-79), by Web Push so they arrive also when Haalendar is closed:
// - state: unsupported (no service worker / push in this browser, or the development server without one), blocked
//   (the user denied notifications in the browser), on (subscribed and registered for this user), off;
// - enable: asks the browser's permission (call it from a click), subscribes with the instance's VAPID key and
//   registers the subscription; its id is kept on this device per user;
// - disable: revokes it on the server and unsubscribes the browser; at sign-out quietly (the session ends anyway).
// The service worker shows the notification (public/push-sw.js); a click asks an open window to go to the reminder's
// day (openFromWorker), the app listens in the shell.
import { addPushSubscription, getVapidPublicKey, removePushSubscription } from "@/api/generated/sdk.gen";
import { runWrite } from "@/api/write";
import i18n from "@/i18n";

import { describeError, log } from "./log";
import { notify } from "./notify";

export type PushState = "unsupported" | "blocked" | "on" | "off";

const key = (user: string) => `haalendar.push.${user}`;

function storedId(user: string): string | null {
  try {
    return window.localStorage.getItem(key(user));
  } catch {
    return null;
  }
}

function storeId(user: string, id: string | null): void {
  try {
    if (id) window.localStorage.setItem(key(user), id);
    else window.localStorage.removeItem(key(user));
  } catch {
    // Blocked storage: the subscription works, this device just forgets it is on.
  }
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

export async function pushState(user: string): Promise<PushState> {
  const worker = await registration();
  if (!worker) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const subscription = await worker.pushManager.getSubscription();
  return subscription && storedId(user) && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** Turns browser notifications on for this device (from a click: the browser asks for permission). */
export async function enablePush(user: string): Promise<PushState> {
  const worker = await registration();
  if (!worker) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    log.info("push_permission", { permission });
    return permission === "denied" ? "blocked" : "off";
  }
  const { data } = await getVapidPublicKey();
  if (!data) return "off";
  let subscription: PushSubscription;
  try {
    subscription =
      (await worker.pushManager.getSubscription()) ??
      (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.public_key) }));
  } catch (error) {
    // E.g. a private window, or a browser build without a push service: the user is told, nothing is registered.
    log.warn("push_subscribe_failed", { error: describeError(error) });
    notify.failure(i18n.t("push.failed"));
    return "off";
  }
  const json = subscription.toJSON();
  const result = await runWrite({
    name: "push_subscribe",
    run: () =>
      addPushSubscription({
        body: {
          endpoint: json.endpoint ?? subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        },
      }),
    success: i18n.t("push.enabled"),
  });
  if (!result.ok || !result.data.id) return "off";
  storeId(user, result.data.id);
  return "on";
}

/** Turns them off for this device; at sign-out quietly. */
export async function disablePush(user: string, reason: "user" | "sign_out"): Promise<void> {
  const id = storedId(user);
  storeId(user, null);
  if (id) {
    await runWrite({
      name: "push_unsubscribe",
      run: () => removePushSubscription({ path: { id }, query: { reason } }),
      success: reason === "user" ? i18n.t("push.disabled") : () => null,
      ...(reason === "sign_out" ? { failure: "inline" as const, retry: false } : {}),
    });
  }
  const worker = await registration();
  const subscription = await worker?.pushManager.getSubscription();
  await subscription?.unsubscribe().catch(() => false);
}

/** The service worker asks an open window to show a reminder (notification click). */
export function listenToWorker(open: (url: string) => void): () => void {
  if (!pushSupported()) return () => undefined;
  const onMessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; url?: string } | null;
    if (message?.type === "haalendar:open" && typeof message.url === "string" && message.url.startsWith("/")) {
      open(message.url);
    }
  };
  const container = navigator.serviceWorker;
  container.addEventListener("message", onMessage);
  return () => {
    container.removeEventListener("message", onMessage);
  };
}

// Pushes delivered while the browser was closed find no listener; they open a window at their URL instead.
