// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. Event details card (FR-CAL-08, F-15, D-65): opens by click / tap,
// right-click (no browser menu) and keyboard; shows title, badges, the range of THIS occurrence, location, calendar,
// priority, the description preview (50 characters + "more" → full Markdown), attachments from the local database and
// the timestamps; Edit (button and key E) opens the editor; a calendar shared for viewing is read-only; on desktops a
// popover next to the row that gives the focus back on Esc, on phones a sheet.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { eventRange } from "@/lib/dayView";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

// Intl puts thin / narrow no-break spaces around the range dash; compare with plain spaces.
const plain = (value: string | null): string => (value ?? "").replace(/[\u2009\u202f\u00a0]/g, " ");

const USER = me().id;
const VIEWER = me().time_zone;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const SHARED = "0199f000-0000-7000-8000-0000000000c2";
const MEETING = "0199f000-0000-7000-8000-0000000000e1";
const PARTY = "0199f000-0000-7000-8000-0000000000e2";
const DAY = "2026-11-10";
const BODY = "Bring the **quarterly numbers** and the printed agenda for everybody, please.";

beforeAll(async () => {
  await import("@/components/markdown/MarkdownView"); // the lazily loaded renderer, warm for "more"
});

afterEach(() => {
  stubMatchMedia(false);
});

function screenWidth(width: number): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? width >= Number(min[1]) : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
}

async function seed(): Promise<void> {
  const db = await localDb(USER);
  await db.calendars.bulkPut([
    { id: OWN, name: "Work", owner_id: USER, deleted_at: null },
    { id: SHARED, name: "Bob's family", owner_id: "someone-else", deleted_at: null },
  ]);
  await db.shares.put({
    id: "s1",
    container_kind: "calendar",
    container_id: SHARED,
    grantee_id: USER,
    permission: "view",
    revoked_at: null,
  });
  const common = { kind: "event", container_kind: "calendar", deleted_at: null, version: 2, tzid: VIEWER };
  await db.items.bulkPut([
    {
      ...common,
      id: MEETING,
      container_id: OWN,
      title: "Team meeting",
      color: "blue",
      priority: "high",
      all_day: false,
      start_date: "2026-11-03",
      end_date: "2026-11-03",
      start_time: "11:00",
      end_time: "12:00",
      rrule: "FREQ=WEEKLY",
      location: "Room 4",
      body: BODY,
      created_at: "2026-10-20T08:00:00Z",
      updated_at: "2026-10-21T08:00:00Z",
    },
    {
      ...common,
      id: PARTY,
      container_id: SHARED,
      title: "Party",
      color: "red",
      priority: "medium",
      all_day: true,
      start_date: "2026-11-09",
      end_date: "2026-11-11",
      start_time: null,
      end_time: null,
      rrule: null,
      location: null,
      body: null,
      created_at: "2026-10-20T08:00:00Z",
      updated_at: "2026-10-20T08:00:00Z",
    },
  ]);
  await db.attachments.put({
    id: "a1",
    item_id: MEETING,
    container_kind: "calendar",
    container_id: OWN,
    file_name: "whiteboard.png",
    media_type: "image/png",
    size_bytes: 2048,
    width: 800,
    height: 600,
    deleted_at: null,
  });
}

async function openDay() {
  await seed();
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${DAY}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return userEvent.setup();
}

describe("range of one occurrence", () => {
  it("dates for all-day events, instants in the viewer's zone for timed ones", () => {
    const allDay = { all_day: true, start_date: "2026-11-09", end_date: "2026-11-11", rrule: null };
    expect(plain(eventRange(allDay, "2026-11-10", "UTC", "en", "24h"))).toBe("Nov 9 – 11, 2026");
    const series = {
      all_day: false,
      start_date: "2026-11-03",
      end_date: "2026-11-03",
      start_time: "11:00",
      end_time: "12:00",
      tzid: "Europe/Berlin",
      rrule: "FREQ=WEEKLY",
    };
    expect(plain(eventRange(series, "2026-11-10", "Europe/Berlin", "en", "24h"))).toBe("Nov 10, 2026, 11:00 – 12:00");
    expect(plain(eventRange(series, "2026-11-10", "Asia/Baku", "en", "24h"))).toBe("Nov 10, 2026, 14:00 – 15:00");
  });
});

describe("details card", { timeout: 15_000 }, () => {
  it("shows the occurrence with badges, description preview and more, attachments; Edit opens the editor", async () => {
    const user = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Team meeting" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(within(card).getByRole("heading", { name: "Team meeting" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Repeats: Every week");
    expect(plain(card.textContent)).toContain("Nov 10, 2026, 11:00 – 12:00"); // this occurrence, not the series start
    expect(card).toHaveTextContent("Room 4");
    expect(card).toHaveTextContent("Work");
    expect(card).toHaveTextContent("High");
    expect(card).toHaveTextContent("Bring the quarterly numbers and the printed agenda…"); // 50 characters
    await user.click(within(card).getByRole("button", { name: "more" }));
    expect(await within(card).findByText("quarterly numbers")).toContainHTML("quarterly numbers"); // rendered Markdown
    expect(within(card).getByText("quarterly numbers").tagName).toBe("STRONG");
    expect(card).toHaveTextContent("1 attachment");
    await user.click(within(card).getByRole("button", { name: "Open whiteboard.png" }));
    expect(await screen.findByRole("dialog", { name: "whiteboard.png" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "whiteboard.png" })).not.toBeInTheDocument();
    });

    await user.click(within(card).getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
  });

  it("opens on right-click without the browser menu, and with the keyboard; E edits", async () => {
    const user = await openDay();
    const row = await screen.findByRole("button", { name: "Details of Team meeting" });
    const notPrevented = fireEvent.contextMenu(row);
    expect(notPrevented).toBe(false); // the browser's own menu is suppressed
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });

    row.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
    await user.keyboard("e");
    expect(await screen.findByRole("dialog", { name: "Edit event" })).toBeInTheDocument();
  });

  it("is read-only for a calendar shared for viewing", async () => {
    const user = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Party" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(card).toHaveTextContent("View only");
    expect(card).toHaveTextContent("Bob's family");
    expect(plain(card.textContent)).toContain("Nov 9 – 11, 2026");
    expect(within(card).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.keyboard("e");
    expect(screen.queryByRole("dialog", { name: "Edit event" })).not.toBeInTheDocument();
  });

  it("desktop: a popover next to the row that returns the focus on Esc", async () => {
    screenWidth(1280);
    const user = await openDay();
    const row = await screen.findByRole("button", { name: "Details of Team meeting" });
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(within(card).getByRole("heading", { name: "Team meeting" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });
    expect(row).toHaveFocus();
  });
});
