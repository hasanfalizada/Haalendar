// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Reminders in the interface (FR-CAL-29, D-79): set in the editor
// (presets of the event's kind, custom, at most five, remove), written through the outbox in the same undo step as the
// event, listed in the details card; a reminder notification reads "Reminder: … — Today, 11:00–12:00" in the
// reader's zone, opens its day with the event's card, and one that arrives while the app is open also pops up.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notificationKeys } from "@/api/notifications";
import { addDays, todayIn } from "@/lib/datetime";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const DENTIST = "0199f000-0000-7000-8000-0000000000e1";
const TODAY = todayIn(me().time_zone);

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function seed(reminders: Record<string, unknown>[] = []) {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.put({
    id: DENTIST,
    kind: "event",
    container_kind: "calendar",
    container_id: OWN,
    deleted_at: null,
    version: 2,
    tzid: me().time_zone,
    title: "Dentist",
    color: "blue",
    priority: "medium",
    location: null,
    body: null,
    all_day: false,
    start_date: TODAY,
    start_time: "11:00",
    end_date: TODAY,
    end_time: "12:00",
    rrule: null,
  });
  await db.reminders.bulkPut(reminders);
  return db;
}

function reminderNote(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    kind: "reminder",
    item_id: DENTIST,
    created_at: new Date().toISOString(),
    read_at: null,
    payload: {
      item_id: DENTIST,
      title: "Dentist",
      occurrence_date: TODAY,
      all_day: false,
      start_time: "11:00",
      end_time: "12:00",
      length_minutes: 60,
      tzid: me().time_zone,
      late: false,
      ...extra,
    },
  };
}

describe("reminders in the editor and the card", { timeout: 15_000 }, () => {
  it("adds and removes reminders, writes them with the event in one undo step, shows them in the card", async () => {
    const db = await seed([
      {
        id: "r-old",
        item_id: DENTIST,
        offset_minutes: 60,
        all_day_time: null,
        all_day_days_before: null,
        deleted_at: null,
      },
    ]);
    stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
    renderApp(`/calendar?date=${TODAY}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(card).toHaveTextContent("1 hour before");
    await user.click(within(card).getByRole("button", { name: "Edit" }));

    const editor = await screen.findByRole("dialog", { name: "Edit event" });
    const group = within(editor).getByRole("group", { name: "Reminders" });
    expect(within(group).getByText("1 hour before")).toBeInTheDocument();
    await user.selectOptions(within(group).getByRole("combobox", { name: "Add reminder" }), "15 minutes before");
    // A custom one: 3 days before.
    await user.selectOptions(within(group).getByRole("combobox", { name: "Add reminder" }), "Custom…");
    await user.clear(within(group).getByRole("spinbutton", { name: "Amount" }));
    await user.type(within(group).getByRole("spinbutton", { name: "Amount" }), "3");
    await user.selectOptions(within(group).getByRole("combobox", { name: "Unit" }), "days before");
    await user.click(within(group).getByRole("button", { name: "Add" }));
    await user.click(within(group).getByRole("button", { name: "Remove reminder: 1 hour before" }));
    expect(
      within(group)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["3 days before", "15 minutes before"]);
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    const toast = await screen.findByText("Event saved: Dentist");
    const ops = (await outbox()).map((entry) => [entry.entity_type, entry.op, entry.data]);
    expect(ops).toEqual([
      ["reminder", "delete", undefined],
      ["reminder", "create", { item_id: DENTIST, offset_minutes: 4320 }],
      ["reminder", "create", { item_id: DENTIST, offset_minutes: 15 }],
    ]);
    expect((await db.reminders.get("r-old"))?.deleted_at).toBeTruthy();

    // The closing editor keeps the page inert until it is gone.
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit event" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.reminders.get("r-old"))?.deleted_at).toBeFalsy();
    });
    const active = (await db.reminders.toArray()).filter((row) => !row.deleted_at);
    expect(active.map((row) => row.id)).toEqual(["r-old"]);
  });

  it("all-day events offer the day forms; at most five", async () => {
    const db = await seed();
    await db.items.update(DENTIST, { all_day: true, start_time: null, end_time: null });
    stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
    renderApp(`/calendar?date=${TODAY}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Edit" }),
    );
    const group = within(await screen.findByRole("dialog", { name: "Edit event" })).getByRole("group", {
      name: "Reminders",
    });
    const add = () => within(group).getByRole("combobox", { name: "Add reminder" });
    expect(
      within(add())
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Add reminder",
      "On the day at 09:00",
      "1 day before at 09:00",
      "2 days before at 09:00",
      "7 days before at 09:00",
      "Custom…",
    ]);
    for (const label of [
      "On the day at 09:00",
      "1 day before at 09:00",
      "2 days before at 09:00",
      "7 days before at 09:00",
    ]) {
      await user.selectOptions(add(), label);
    }
    await user.selectOptions(add(), "Custom…");
    await user.clear(within(group).getByRole("spinbutton", { name: "Days before" }));
    await user.type(within(group).getByRole("spinbutton", { name: "Days before" }), "3");
    await user.selectOptions(within(group).getByRole("combobox", { name: "Time" }), "18:30");
    await user.click(within(group).getByRole("button", { name: "Add" }));
    expect(within(group).getByText("3 days before at 18:30")).toBeInTheDocument();
    expect(within(group).getByText("At most 5 reminders per event.")).toBeInTheDocument();
    expect(within(group).queryByRole("combobox", { name: "Add reminder" })).not.toBeInTheDocument();
  });
});

describe("reminder notifications", { timeout: 15_000 }, () => {
  it("reads in the reader's zone, opens the day with the event's card, and pops up when it arrives", async () => {
    await seed();
    let notes = [reminderNote("n1", { late: true })];
    stubApi({
      "GET /me": () => json(me()),
      "GET /notifications": () => json({ data: notes, unread_count: notes.length, next_cursor: null }),
      "POST /notifications/read": () => new Response(null, { status: 204 }),
    });
    const { router, queryClient } = renderApp(`/calendar?date=${addDays(TODAY, 3)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
    const item = await screen.findByText("Reminder: Dentist — Today, 11:00–12:00 (sent late)");
    expect(screen.queryByText(/^Reminder: Dentist/, { selector: "[data-sonner-toast] *" })).not.toBeInTheDocument();

    await user.click(item);
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ date: TODAY, view: "day" });
    });
    expect(await screen.findByRole("dialog", { name: "Event details" })).toHaveTextContent("Dentist");
    expect(router.state.location.search).not.toHaveProperty("event"); // the card is open, the URL is clean again
    await user.keyboard("{Escape}");

    // A new reminder arrives while the app is open: a message with Open.
    notes = [reminderNote("n2"), ...notes];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    });
    const popped = await screen.findByText("Reminder: Dentist — Today, 11:00–12:00", { selector: "[data-title]" });
    expect(within(popped.closest("li") ?? document.body).getByRole("button", { name: "Open" })).toBeInTheDocument();
  });
});

describe("reminder notifications on desktops", { timeout: 15_000 }, () => {
  afterEach(() => {
    stubMatchMedia(false);
  });

  it("the bell's panel closes without taking the focus back, so the event's card stays open", async () => {
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
    await seed();
    const notes = [reminderNote("n1")];
    stubApi({
      "GET /me": () => json(me()),
      "GET /notifications": () => json({ data: notes, unread_count: 1, next_cursor: null }),
      "POST /notifications/read": () => new Response(null, { status: 204 }),
    });
    renderApp(`/calendar?date=${addDays(TODAY, 3)}&view=month`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));
    await user.click(await screen.findByText("Reminder: Dentist — Today, 11:00–12:00"));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(card).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details of Dentist" })).toHaveAttribute("aria-expanded", "true");
  });
});
