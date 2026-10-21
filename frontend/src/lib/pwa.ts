// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Installable app (FR-OFF-06, D-55):
// - service worker (production builds only): registered with workbox-window; a newly downloaded version waits until
//   the user chooses "Reload" in a notification, so an update never interrupts typing;
// - installation: the browser's `beforeinstallprompt` is kept so the user menu can offer "Install app" when (and only
//   when) the browser allows it; iOS has no such event — Help explains "Share → Add to Home Screen" there.
// Listeners hear changes of the install state.
import { Workbox } from "workbox-window";

import i18n from "@/i18n";
import { describeError, log } from "@/lib/log";
import { notify } from "@/lib/notify";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function canInstall(): boolean {
  return installEvent !== null;
}

/** Shows the browser's install dialog; true when the user accepted. */
export async function install(): Promise<boolean> {
  const event = installEvent;
  if (!event) return false;
  installEvent = null;
  changed();
  await event.prompt();
  const { outcome } = await event.userChoice;
  log.info("app_install_choice", { outcome });
  return outcome === "accepted";
}

/** iPhone / iPad Safari outside an installed app: "Add to Home Screen" is the only way. */
export function isIosBrowser(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && standalone === false;
}

export function listenForInstall(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // offered from the user menu instead of the browser's own banner
    installEvent = event as BeforeInstallPromptEvent;
    log.info("app_installable");
    changed();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    log.info("app_installed");
    changed();
  });
}

/** Registers the service worker (production only) and offers a waiting new version. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const workbox = new Workbox("/sw.js");
  let reloading = false;
  workbox.addEventListener("waiting", () => {
    log.info("app_update_waiting");
    notify.update(i18n.t("pwa.updateReady"), {
      label: i18n.t("pwa.reload"),
      run: () => {
        reloading = true;
        workbox.messageSkipWaiting();
      },
    });
  });
  workbox.addEventListener("controlling", () => {
    if (reloading) window.location.reload();
  });
  workbox.register().then(
    () => {
      log.info("service_worker_registered");
    },
    (error: unknown) => {
      log.warn("service_worker_failed", { error: describeError(error) });
    },
  );
}
