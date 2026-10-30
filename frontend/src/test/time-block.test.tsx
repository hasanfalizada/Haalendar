// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. Time blocking in the interface (FR-INT-04, D-99): "Notes & cards" opens
// a panel in the day and week views (remembered); it lists notes and cards (boards named, scheduled ones marked); and
// "Schedule…" opens the event editor for the item, whose Save writes the event and its time-block link in one step.
// Dragging onto the week grid is checked in the browser (jsdom has no layout).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const DAY = "2026-12-01";
const MINE = "0199f000-0000-7000-8000-0000000000c1";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const SHOPPING = "0199f000-0000-7000-8000-0000000000e1";
const PLAN = "0199f000-0000-7000-8000-0000000000e2";
const BLOCKED = "0199f000-0000-7000-8000-0000000000e3";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? 1280 >= Number(min[1]) : false,
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
});

afterEach(() => {
  stubMatchMedia(false);
});

const note = (id: string, title: string) => ({
  id,
  kind: "note",
  container_kind: "note",
  container_id: id,
  owner_id: USER,
  title,
  body: "",
  color: "yellow",
  priority: "medium",
  pinned: false,
  archived_at: null,
  position: "U",
  deleted_at: null,
  version: 2,
});

async function open(path = `/calendar?date=${DAY}&view=week`) {
  window.localStorage.clear();
  const db = await localDb(USER);
  await db.calendars.put({
    id: MINE,
    name: "My calendar",
    color: "blue",
    owner_id: USER,
    is_default: true,
    archived_at: null,
    deleted_at: null,
    version: 2,
  });
  await db.boards.put({ id: BOARD, owner_id: USER, name: "Revamp", position: "U", deleted_at: null, version: 2 });
  await db.items.bulkPut([
    note(SHOPPING, "Shopping"),
    note(BLOCKED, "Scheduled note"),
    {
      id: PLAN,
      kind: "card",
      container_kind: "board",
      container_id: BOARD,
      column_id: "col",
      title: "Plan release",
      body: "",
      color: "green",
      priority: "medium",
      position: "C",
      due_date: "2026-12-03",
      deleted_at: null,
      version: 2,
    },
  ]);
  await db.links.put({
    id: "l1",
    from_item_id: "some-event",
    to_item_id: BLOCKED,
    container_kind: "calendar",
    container_id: MINE,
    to_container_kind: "note",
    to_container_id: BLOCKED,
    origin: "time_block",
    deleted_at: null,
    version: 1,
  });
  stubApi({
    "GET /me": () => json(me()),
    "GET /me/settings": () => json(settings()),
    "POST /sync/push": () => new Promise<Response>(() => undefined),
  });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

describe("time blocking", { timeout: 20_000 }, () => {
  it("opens the panel, lists notes and cards, and Schedule… saves an event linked to the item", async () => {
    const { user } = await open();
    const toggle = await screen.findByRole("button", { name: "Notes & cards" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    const panel = await screen.findByRole("region", { name: "Notes and cards" });
    expect(window.localStorage.getItem("haalendar.calendar.timeBlock")).toBe("open");
    await waitFor(() => {
      expect(within(panel).getByText("Shopping")).toBeInTheDocument();
    });
    expect(within(panel).getByRole("img", { name: "Scheduled already" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Cards" }));
    expect(await within(panel).findByText("Due Dec 3 · on Revamp")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Notes" }));

    await user.click(await within(panel).findByRole("button", { name: "Schedule Shopping" }));
    const editor = await screen.findByRole("dialog", { name: "New event" });
    expect(within(editor).getByLabelText("Title")).toHaveValue("Shopping");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Event created: Shopping");
    const [created, link] = await outbox();
    expect(created).toMatchObject({
      entity_type: "item",
      op: "create",
      data: {
        kind: "event",
        title: "Shopping",
        all_day: false,
        start_date: DAY,
        start_time: "09:00",
        end_time: "10:00",
      },
    });
    expect(link).toMatchObject({
      entity_type: "link",
      op: "create",
      data: { from_item_id: created?.entity_id, to_item_id: SHOPPING, origin: "time_block" },
    });
  });

  it("offers the panel in the day view too", async () => {
    await open(`/calendar?date=${DAY}&view=day`);
    expect(await screen.findByRole("button", { name: "Notes & cards" })).toBeInTheDocument();
  });

  it("does not offer it in the month view", async () => {
    await open(`/calendar?date=${DAY}&view=month`);
    await screen.findAllByRole("button", { name: "Today" });
    expect(screen.queryByRole("button", { name: "Notes & cards" })).not.toBeInTheDocument();
  });
});
