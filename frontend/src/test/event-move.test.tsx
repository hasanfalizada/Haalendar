// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. Move to next day (FR-CAL-20, D-73): from the details card and for a
// selection of the day list (FR-X-07); a one-off event shifts its dates, an occurrence of a series becomes a one-off
// copy on the next day with its date excluded; everything goes through the outbox (offline too), one undo step brings
// it all back; events of a calendar shared for viewing cannot be moved; Ctrl/Cmd+click selects instead of opening.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const SHARED = "0199f000-0000-7000-8000-0000000000c2";
const DENTIST = "0199f000-0000-7000-8000-0000000000e1";
const STANDUP = "0199f000-0000-7000-8000-0000000000e2";
const PARTY = "0199f000-0000-7000-8000-0000000000e3";
const DAY = "2026-11-10";
const NEXT = "2026-11-11";

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

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function openDay() {
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
  const common = {
    kind: "event",
    container_kind: "calendar",
    deleted_at: null,
    version: 4,
    tzid: me().time_zone,
    color: "blue",
    priority: "medium",
    location: null,
    body: null,
  };
  await db.items.bulkPut([
    {
      ...common,
      id: DENTIST,
      container_id: OWN,
      title: "Dentist",
      all_day: false,
      start_date: DAY,
      start_time: "09:00",
      end_date: DAY,
      end_time: "09:30",
      rrule: null,
    },
    {
      ...common,
      id: STANDUP,
      container_id: OWN,
      title: "Standup",
      all_day: false,
      start_date: "2026-11-03",
      start_time: "10:00",
      end_date: "2026-11-03",
      end_time: "10:15",
      rrule: "FREQ=DAILY",
    },
    {
      ...common,
      id: PARTY,
      container_id: SHARED,
      title: "Party",
      all_day: true,
      start_date: DAY,
      end_date: DAY,
      start_time: null,
      end_time: null,
      rrule: null,
    },
  ]);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${DAY}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

const undoIn = (toast: HTMLElement) =>
  within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" });

describe("move to next day", { timeout: 15_000 }, () => {
  it("from the details card: a one-off event shifts its dates, undo moves it back", async () => {
    const { user, db } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    await user.click(within(card).getByRole("button", { name: "Move to next day" }));

    const toast = await screen.findByText(/^Moved Dentist to /);
    expect(await outbox()).toMatchObject([
      {
        entity_id: DENTIST,
        op: "update",
        base_version: 4,
        base: { start_date: DAY, end_date: DAY },
        data: { start_date: NEXT, end_date: NEXT },
      },
    ]);
    expect(await db.items.get(DENTIST)).toMatchObject({ start_date: NEXT, start_time: "09:00", end_time: "09:30" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Dentist" })).not.toBeInTheDocument();
    });

    await user.click(undoIn(toast));
    expect(await screen.findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
    expect(await db.items.get(DENTIST)).toMatchObject({ start_date: DAY, end_date: DAY });
  });

  it("an occurrence of a series becomes a one-off copy on the next day; its date leaves the series", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    await user.click(within(card).getByRole("button", { name: "Move to next day" }));

    await screen.findByText(/^Moved Standup to /);
    const [copy, exclusion] = await outbox();
    expect(copy).toMatchObject({
      op: "create",
      data: {
        kind: "event",
        container_id: OWN,
        title: "Standup",
        start_date: NEXT,
        start_time: "10:00",
        end_date: NEXT,
        end_time: "10:15",
        rrule: null,
      },
    });
    expect(exclusion).toMatchObject({
      entity_id: STANDUP,
      op: "exclude",
      data: { occurrence_date: DAY, override_event_id: copy?.entity_id },
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Standup" })).not.toBeInTheDocument();
    });
  });

  it("a selection moves together in one undo step; events shown for viewing only cannot be moved", async () => {
    const { user, db } = await openDay();
    const bar = await screen.findByRole("toolbar", { name: "Bulk actions" });
    await user.click(screen.getByRole("checkbox", { name: "Select Dentist" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Party" }));
    expect(bar).toHaveTextContent("2 of 3 selected");
    expect(within(bar).queryByRole("button", { name: "Move to next day" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select Party" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Standup" }));
    expect(bar).toHaveTextContent("2 of 3 selected");
    await user.click(within(bar).getByRole("button", { name: "Move to next day" }));

    const toast = await screen.findByText("Moved 2 events to the next day");
    expect((await outbox()).map((entry) => entry.op).sort()).toEqual(["create", "exclude", "update"]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Dentist" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Details of Standup" })).not.toBeInTheDocument();
    expect(bar).not.toHaveTextContent("selected");

    await user.click(undoIn(toast));
    expect(await screen.findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Details of Standup" })).toBeInTheDocument();
    expect(await db.items.get(DENTIST)).toMatchObject({ start_date: DAY });
  });

  it("the details card of a view-only event has no move", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Party" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(within(card).queryByRole("button", { name: "Move to next day" })).not.toBeInTheDocument();
  });

  it("desktop: Ctrl+click and Shift+click select without opening the card, Esc clears", async () => {
    screenWidth(1280);
    const { user } = await openDay();
    const party = await screen.findByRole("button", { name: "Details of Party" });
    const standup = screen.getByRole("button", { name: "Details of Standup" });
    await user.keyboard("{Control>}");
    await user.click(party);
    await user.keyboard("{/Control}");
    expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    await user.keyboard("{Shift>}");
    await user.click(standup);
    await user.keyboard("{/Shift}");
    const bar = screen.getByRole("toolbar", { name: "Bulk actions" });
    expect(bar).toHaveTextContent("3 of 3 selected");
    expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Dentist" })).toBeChecked();

    await user.keyboard("{Escape}");
    expect(bar).not.toHaveTextContent("selected");
    await user.click(party);
    expect(await screen.findByRole("dialog", { name: "Event details" })).toBeInTheDocument();
  });
});
