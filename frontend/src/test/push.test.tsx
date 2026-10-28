// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). Browser notifications on this device (lib/push, D-79), with
// stand-ins for the service worker, PushManager and the permission: turning on asks the browser, subscribes with the
// instance's key and registers the subscription; off revokes it and unsubscribes; a denied permission is "blocked";
// without a service worker it is "unsupported". Settings → Browser notifications shows and switches it; the editor
// offers it once reminders are set, and "Not now" is remembered.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/api/session";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const PUBLIC_KEY = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";

interface FakeSubscription {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function fakeBrowser(permission: NotificationPermission, answer: NotificationPermission = "granted") {
  let subscription: FakeSubscription | null = null;
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(subscription)),
    subscribe: vi.fn((options: { applicationServerKey: Uint8Array }) => {
      subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
          keys: { p256dh: "BKey", auth: "auth" },
          options,
        }),
        unsubscribe: vi.fn(() => {
          subscription = null;
          return Promise.resolve(true);
        }),
      };
      return Promise.resolve(subscription);
    }),
  };
  const registration = { pushManager };
  const notification = Object.assign(vi.fn(), {
    permission,
    requestPermission: vi.fn(() => {
      notification.permission = answer;
      return Promise.resolve(answer);
    }),
  });
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("PushManager", vi.fn());
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn(() => Promise.resolve(registration)),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  return { pushManager, notification, current: () => subscription };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

/** The fake server; the returned list gets every call. */
function api(): { method: string; path: string; body: unknown }[] {
  return stubApi({
    "GET /me": () => json(me()),
    "GET /push/vapid-public-key": () => json({ public_key: PUBLIC_KEY }),
    "POST /me/push-subscriptions": () => json({ id: "0199f000-0000-7000-8000-00000000aa01" }, 201),
    "DELETE /me/push-subscriptions/0199f000-0000-7000-8000-00000000aa01": () => new Response(null, { status: 204 }),
  });
}

const pushCalls = (calls: ReturnType<typeof api>) =>
  calls
    .filter((call) => call.path.startsWith("/me/push-subscriptions"))
    .map((call) => [call.method, call.path, call.body]);

describe("browser notifications in settings", { timeout: 15_000 }, () => {
  it("turns on with the browser's permission and the instance's key, and off again", async () => {
    const browser = fakeBrowser("default");
    const calls = api();
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Browser notifications" });
    expect(await within(section).findByText("Off for this device.")).toBeInTheDocument();

    await user.click(within(section).getByRole("button", { name: "Turn on" }));
    expect(await within(section).findByText("On for this device.")).toBeInTheDocument();
    expect(browser.notification.requestPermission).toHaveBeenCalled();
    const key = browser.pushManager.subscribe.mock.calls[0]?.[0].applicationServerKey;
    expect(key?.length).toBe(65); // the decoded public key
    expect(pushCalls(calls)).toEqual([
      [
        "POST",
        "/me/push-subscriptions",
        { endpoint: "https://fcm.googleapis.com/fcm/send/device-1", keys: { p256dh: "BKey", auth: "auth" } },
      ],
    ]);
    expect(await screen.findByText("Browser notifications are on for this device.")).toBeInTheDocument();

    const off = browser.current();
    await user.click(within(section).getByRole("button", { name: "Turn off" }));
    expect(await within(section).findByText("Off for this device.")).toBeInTheDocument();
    expect(pushCalls(calls).at(-1)).toEqual([
      "DELETE",
      "/me/push-subscriptions/0199f000-0000-7000-8000-00000000aa01?reason=user",
      undefined,
    ]);
    expect(off?.unsubscribe).toHaveBeenCalled();
  });

  it("says when the browser blocks it, or cannot do it", async () => {
    fakeBrowser("default", "denied");
    api();
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Browser notifications" });
    await user.click(await within(section).findByRole("button", { name: "Turn on" }));
    expect(await within(section).findByText(/blocked for Haalendar in this browser/)).toBeInTheDocument();
  });

  it("says so when the browser cannot subscribe (e.g. a private window)", async () => {
    const browser = fakeBrowser("default");
    browser.pushManager.subscribe.mockRejectedValueOnce(new DOMException("Registration failed", "AbortError"));
    const calls = api();
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Browser notifications" });
    await user.click(await within(section).findByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/This browser could not turn notifications on/)).toBeInTheDocument();
    expect(within(section).getByText("Off for this device.")).toBeInTheDocument();
    expect(pushCalls(calls)).toEqual([]);
  });

  it("is unsupported without a service worker", async () => {
    api();
    renderApp("/settings");
    const section = await screen.findByRole("region", { name: "Browser notifications" });
    expect(await within(section).findByText(/cannot show notifications from Haalendar/)).toBeInTheDocument();
  });
});

describe("signing out", { timeout: 15_000 }, () => {
  it("ends this browser's subscription of the user", async () => {
    const browser = fakeBrowser("default");
    const calls = api();
    const { queryClient } = renderApp("/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Browser notifications" });
    await user.click(await within(section).findByRole("button", { name: "Turn on" }));
    await within(section).findByText("On for this device.");
    const subscription = browser.current();
    await act(async () => {
      await signOut(queryClient);
    });
    expect(pushCalls(calls).at(-1)).toEqual([
      "DELETE",
      "/me/push-subscriptions/0199f000-0000-7000-8000-00000000aa01?reason=sign_out",
      undefined,
    ]);
    expect(subscription?.unsubscribe).toHaveBeenCalled();
    expect(window.localStorage.getItem(`haalendar.push.${USER}`)).toBeNull();
  });
});

describe("the offer in the editor", { timeout: 15_000 }, () => {
  it("appears once reminders are set, turns notifications on, and Not now is remembered", async () => {
    fakeBrowser("default");
    const calls = api();
    await localDb(USER);
    renderApp("/calendar");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New event" }));
    const group = within(await screen.findByRole("dialog", { name: "New event" })).getByRole("group", {
      name: "Reminders",
    });
    expect(within(group).queryByText(/Get reminders as notifications/)).not.toBeInTheDocument();
    await user.selectOptions(within(group).getByRole("combobox", { name: "Add reminder" }), "On the day at 09:00");
    expect(await within(group).findByText(/Get reminders as notifications/)).toBeInTheDocument();
    await user.click(within(group).getByRole("button", { name: "Not now" }));
    expect(within(group).queryByText(/Get reminders as notifications/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`haalendar.push.offer.${USER}`)).toBe("dismissed");
    await waitFor(() => {
      expect(pushCalls(calls)).toEqual([]);
    });
  });
});
