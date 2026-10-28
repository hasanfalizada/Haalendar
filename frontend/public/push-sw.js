/* +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). Web Push in the service worker (FR-CAL-29, D-79), loaded
 * by the generated worker through importScripts (vite.config.ts). Plain JavaScript, no build step.
 * - push: the message is JSON {title, body, url, tag} from the server; while a Haalendar window is visible the app shows
 *   the reminder itself, so no system notification is shown then (no duplicates); otherwise one notification, the
 *   tag replacing an older one of the same reminder and occurrence.
 * - notificationclick: an open window is focused and told where to go (the app navigates without reloading);
 *   without one a new window opens at the reminder's day.
 */
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((client) => client.visibilityState === "visible")) return;
      await self.registration.showNotification(message.title || "Haalendar", {
        body: message.body || "",
        tag: message.tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: message.url || "/calendar" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/calendar";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        open.postMessage({ type: "haalendar:open", url });
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
