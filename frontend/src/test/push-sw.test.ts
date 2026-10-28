// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). The service worker's push handlers (public/push-sw.js,
// D-79), run with a stand-in `self`: a push shows one notification with the server's title, body and tag — unless a
// Haalendar window is visible (the app shows it itself); a click focuses an open window and tells it where to go, or
// opens a new one.
import { describe, expect, it, vi } from "vitest";

import SCRIPT from "../../public/push-sw.js?raw";

type Listener = (event: Record<string, unknown>) => void;

function worker(windows: { visibilityState: string }[]) {
  const listeners = new Map<string, Listener>();
  const clients = windows.map((w) => ({ ...w, postMessage: vi.fn(), focus: vi.fn(() => Promise.resolve()) }));
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: { matchAll: vi.fn(() => Promise.resolve(clients)), openWindow: vi.fn(() => Promise.resolve(null)) },
    registration: { showNotification: vi.fn(() => Promise.resolve()) },
    location: { origin: "https://cal.example.org" },
  };
  // The worker's own file, run as the browser would run it inside the service worker.
  const run = new Function("self", SCRIPT) as (scope: typeof self) => void; // eslint-disable-line @typescript-eslint/no-implied-eval
  run(self);
  const fire = async (type: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { self, clients, fire };
}

const message = {
  title: "Reminder: Dentist",
  body: "Today, 11:00–12:00 · Main St 1",
  url: "/calendar?date=2026-11-10&view=day&event=e1",
  tag: "reminder:r1:2026-11-10",
};

describe("push-sw.js", () => {
  it("shows the reminder when no Haalendar window is visible", async () => {
    const { self, fire } = worker([{ visibilityState: "hidden" }]);
    await fire("push", { data: { json: () => message } });
    expect(self.registration.showNotification).toHaveBeenCalledWith("Reminder: Dentist", {
      body: "Today, 11:00–12:00 · Main St 1",
      tag: "reminder:r1:2026-11-10",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: message.url },
    });
  });

  it("leaves it to a visible window, and copes with an unreadable message", async () => {
    const visible = worker([{ visibilityState: "visible" }]);
    await visible.fire("push", { data: { json: () => message } });
    expect(visible.self.registration.showNotification).not.toHaveBeenCalled();

    const broken = worker([]);
    await broken.fire("push", {
      data: {
        json: () => {
          throw new SyntaxError("not JSON");
        },
      },
    });
    expect(broken.self.registration.showNotification).toHaveBeenCalledWith(
      "Haalendar",
      expect.objectContaining({ body: "", data: { url: "/calendar" } }),
    );
  });

  it("a click sends an open window to the reminder's day, or opens one", async () => {
    const open = worker([{ visibilityState: "hidden" }]);
    const close = vi.fn();
    await open.fire("notificationclick", { notification: { close, data: { url: message.url } } });
    expect(close).toHaveBeenCalled();
    expect(open.clients[0]?.postMessage).toHaveBeenCalledWith({ type: "haalendar:open", url: message.url });
    expect(open.clients[0]?.focus).toHaveBeenCalled();
    expect(open.self.clients.openWindow).not.toHaveBeenCalled();

    const none = worker([]);
    await none.fire("notificationclick", { notification: { close: vi.fn(), data: { url: message.url } } });
    expect(none.self.clients.openWindow).toHaveBeenCalledWith(message.url);
  });
});
