// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-055. Live updates (FR-OFF-03, D-59): the syncing tab opens one stream,
// `changes` starts a sync, `notification` refreshes the notification center, no polling while the stream is open, a
// closed stream is opened again later, and a signed-out (paused) engine closes it.
import { QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/api/client";
import { NOTIFICATION_POLL_MS, notificationsQuery } from "@/api/notifications";
import { startSync, syncStatus } from "@/sync";

import { type Call, me, problem, stubApi } from "./fake-api";

const USER = me().id;

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly handlers = new Map<string, (() => void)[]>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: () => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  emit(type: string): void {
    for (const handler of this.handlers.get(type) ?? []) handler();
  }

  fail(closed: boolean): void {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.onerror?.();
  }
}

const pulls = (calls: Call[]) => calls.filter((c) => c.path.startsWith("/sync/pull")).length;
const latest = () => FakeEventSource.instances.at(-1);

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live stream", () => {
  it("one stream per syncing tab; changes start a sync; no polling while open", async () => {
    const calls = stubApi({});
    startSync(USER, new QueryClient());
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    expect(latest()?.url).toBe("/api/v1/stream");
    await waitFor(() => {
      expect(pulls(calls)).toBe(1); // the start
    });

    latest()?.open();
    expect(syncStatus().live).toBe(true);
    const refetch = notificationsQuery.refetchInterval as () => number | false;
    expect(refetch()).toBe(false);

    latest()?.emit("changes");
    await waitFor(() => {
      expect(pulls(calls)).toBe(2);
    });
    startSync(USER, new QueryClient()); // the same user again: still one stream
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("a notification refreshes the notification center", async () => {
    stubApi({});
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    startSync(USER, queryClient);
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    latest()?.open();
    latest()?.emit("notification");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["session", "notifications"] });
  });

  it("a dropped stream brings polling back and is opened again later", async () => {
    stubApi({});
    startSync(USER, new QueryClient());
    await waitFor(() => {
      expect(FakeEventSource.instances).toHaveLength(1);
    });
    latest()?.open();
    latest()?.fail(false); // the browser reconnects by itself
    expect(syncStatus().live).toBe(false);
    expect((notificationsQuery.refetchInterval as () => number | false)()).toBe(NOTIFICATION_POLL_MS);
    expect(FakeEventSource.instances).toHaveLength(1);

    latest()?.fail(true); // refused (e.g. 429): we open a new one after a pause
    await waitFor(
      () => {
        expect(FakeEventSource.instances).toHaveLength(2);
      },
      { timeout: 8_000 },
    );
  }, 12_000);

  it("a signed-out engine closes the stream and does not reopen it", async () => {
    stubApi({ "GET /sync/pull": () => problem(401, "session_expired") });
    startSync(USER, new QueryClient());
    await waitFor(() => {
      expect(syncStatus().state).toBe("paused");
    });
    await waitFor(() => {
      expect(latest()?.readyState).toBe(FakeEventSource.CLOSED);
    });
    const opened = FakeEventSource.instances.length;
    latest()?.fail(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(FakeEventSource.instances).toHaveLength(opened);
  });
});
