// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Notification center (FR-X-21, D-52): bell with unread count, list
// newest first with readable texts, opening a notification marks it read and goes to its place, "Mark all read",
// "Show more", notifications kept on this device (sync errors), the drawer entry on phones, the 60 s check.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "@/api/generated/types.gen";
import { NOTIFICATION_POLL_MS, notificationsQuery } from "@/api/notifications";
import { badgeText } from "@/components/notifications/useNotificationCenter";
import { addLocalNotification, listLocalNotifications, wipeLocalNotifications } from "@/lib/localNotifications";

import { type Call, json, me, noContent, renderApp, stubApi } from "./fake-api";

const SHARE = {
  share_id: "0199f000-0000-7000-8000-0000000000a1",
  container_kind: "calendar",
  container_id: "0199f000-0000-7000-8000-0000000000c1",
  container_name: "Family",
  by_name: "Ada",
  permission: "edit",
};

function note(id: number, kind: Notification["kind"], overrides: Partial<Notification> = {}): Notification {
  return {
    id: `0199f000-0000-7000-8000-${String(id).padStart(12, "0")}`,
    kind,
    item_id: null,
    payload: kind.startsWith("share") ? SHARE : { export_id: "x" },
    created_at: new Date(Date.UTC(2026, 9, 19, 10, id)).toISOString(),
    read_at: null,
    ...overrides,
  };
}

function stubCenter(initial: Notification[]) {
  let notes = initial;
  const calls = stubApi({
    "GET /me": () => json(me()),
    "GET /notifications": () =>
      json({ data: notes, unread_count: notes.filter((n) => !n.read_at).length, next_cursor: null }),
    "POST /notifications/read": (call: Call) => {
      const body = call.body as { ids?: string[]; all?: boolean };
      notes = notes.map((n) =>
        body.all || body.ids?.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n,
      );
      return noContent();
    },
  });
  return calls;
}

async function openBell() {
  const user = userEvent.setup();
  const bell = await screen.findByRole("button", { name: /^Notifications/ });
  await user.click(bell);
  const list = await screen.findByRole("list", { name: "Notifications" });
  return { user, bell, list };
}

describe("notification center", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the unread count and readable texts, newest first", async () => {
    stubCenter([
      note(1, "share_received"),
      note(2, "share_revoked"),
      note(3, "export_ready", { read_at: "2026-10-19T11:00:00Z" }),
    ]);
    renderApp("/calendar");
    expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toHaveTextContent("2");
    const { list } = await openBell();
    const items = within(list)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(items[0]).toContain("Your data export is ready to download.");
    expect(items[1]).toContain("Unread: Ada stopped sharing the calendar “Family” with you.");
    expect(items[2]).toContain("Unread: Ada shared the calendar “Family” with you (can edit).");
  });

  it("marks a notification read and opens its place", async () => {
    const calls = stubCenter([note(1, "share_received")]);
    const { router } = renderApp("/calendar");
    const { user, list } = await openBell();
    await user.click(within(list).getByRole("button", { name: /shared the calendar/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings");
    });
    expect(router.state.location.hash).toBe("sharing");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: [note(1, "share_received").id] });
    expect(await screen.findByRole("button", { name: "Notifications" })).not.toHaveTextContent("1");
  });

  it("marks everything read at once", async () => {
    const calls = stubCenter([note(1, "share_received"), note(2, "export_ready")]);
    renderApp("/calendar");
    const { user } = await openBell();
    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ all: true });
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
  });

  it("loads older notifications on request", async () => {
    const calls = stubApi({
      "GET /me": () => json(me()),
      "GET /notifications": (call: Call) =>
        call.path.includes("cursor=c1")
          ? json({ data: [note(1, "export_ready")], unread_count: 2, next_cursor: null })
          : json({ data: [note(2, "share_received")], unread_count: 2, next_cursor: "c1" }),
    });
    renderApp("/calendar");
    const { user, list } = await openBell();
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => {
      expect(within(screen.getByRole("list", { name: "Notifications" })).getAllByRole("listitem")).toHaveLength(2);
    });
    expect(calls.some((c) => c.path.includes("cursor=c1"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("shows notifications kept on this device next to the server's", async () => {
    stubCenter([]);
    renderApp("/calendar");
    await screen.findByRole("button", { name: "Notifications" });
    await addLocalNotification(me().id, "sync_error");
    expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
    const { user, list } = await openBell();
    await user.click(within(list).getByRole("button", { name: /could not be saved to the server/ }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Notifications" }).length).toBeGreaterThan(0);
    });
    expect((await listLocalNotifications(me().id))[0]?.read_at).not.toBeNull();
  });

  it("says when there is nothing new", async () => {
    stubCenter([]);
    renderApp("/calendar");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
  });

  it("offers the center in the drawer on phones", async () => {
    stubCenter([note(1, "export_ready")]);
    const { router } = renderApp("/calendar");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Haalendar" });
    await user.click(await within(drawer).findByRole("button", { name: "Notifications, 1 unread" }));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    await user.click(await within(dialog).findByRole("button", { name: /export is ready/ }));
    await waitFor(() => {
      expect(router.state.location.hash).toBe("export");
    });
    expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
  });
});

describe("notification helpers", () => {
  it("checks for new notifications every minute and when the tab is back", () => {
    expect(notificationsQuery.refetchInterval).toBe(NOTIFICATION_POLL_MS);
    expect(NOTIFICATION_POLL_MS).toBe(60_000);
    expect(notificationsQuery.refetchOnWindowFocus).toBe(true);
  });

  it("caps the badge at 99+", () => {
    expect(badgeText(7)).toBe("7");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
  });

  it("keeps local notifications per user and wipes them on sign-out", async () => {
    await addLocalNotification("u1", "sync_error", { detail: "x" });
    await addLocalNotification("u2", "sync_error");
    expect(await listLocalNotifications("u1")).toHaveLength(1);
    await wipeLocalNotifications("u1");
    expect(await listLocalNotifications("u1")).toEqual([]);
    expect(await listLocalNotifications("u2")).toHaveLength(1);
  });
});
