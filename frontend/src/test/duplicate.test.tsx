// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-096. Duplicate in the app (FR-CAL-34, D-84): from the details card (button
// or the key D), the date offered is the next day; the copy and the user's reminders go to the outbox, the view goes to
// the copy's date with its card open; undo removes the copy. A calendar shared for viewing offers no Duplicate.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const EVENT = "0199f000-0000-7000-8000-0000000000e1";
const SERIES = "0199f000-0000-7000-8000-0000000000e2";
const DAY = "2026-11-10";

const event = {
  id: EVENT,
  kind: "event",
  container_kind: "calendar",
  container_id: OWN,
  title: "Dentist",
  color: "red",
  priority: "high",
  all_day: false,
  start_date: DAY,
  end_date: DAY,
  start_time: "11:00",
  end_time: "12:00",
  tzid: me().time_zone,
  rrule: null,
  location: "Main St 1",
  body: "Bring the card",
  deleted_at: null,
  version: 2,
};

const series = {
  ...event,
  id: SERIES,
  title: "Standup",
  start_date: "2026-11-02",
  end_date: "2026-11-02",
  start_time: "09:00",
  end_time: "09:15",
  rrule: "FREQ=DAILY",
  location: null,
  body: null,
};

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function openDay(permission: "own" | "view" = "own") {
  const db = await localDb(USER);
  await db.calendars.put({
    id: OWN,
    name: "Work",
    owner_id: permission === "own" ? USER : "0199f000-0000-7000-8000-0000000000ff",
    deleted_at: null,
  });
  if (permission === "view") {
    await db.shares.put({
      id: "0199f000-0000-7000-8000-0000000000s1",
      container_kind: "calendar",
      container_id: OWN,
      grantee_id: USER,
      permission: "view",
      revoked_at: null,
      deleted_at: null,
    });
  }
  await db.items.bulkPut([event, series]);
  await db.reminders.bulkPut([
    { id: "r1", item_id: EVENT, offset_minutes: 30, deleted_at: null },
    { id: "r2", item_id: EVENT, offset_minutes: 1440, deleted_at: "2026-10-01T00:00:00Z" },
  ]);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${DAY}&view=day`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

async function details(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole("button", { name: `Details of ${title}` }));
  return screen.findByRole("dialog", { name: "Event details" });
}

describe("duplicate", { timeout: 15_000 }, () => {
  it("copies the event with its reminders to the chosen date and opens the copy; undo removes it", async () => {
    const { user, db } = await openDay();
    await user.click(within(await details(user, "Dentist")).getByRole("button", { name: "Duplicate…" }));
    const dialog = await screen.findByRole("dialog", { name: "Duplicate Dentist" });
    const date = within(dialog).getByLabelText("Start date of the copy");
    expect(date).toHaveValue("2026-11-11");
    await user.clear(date);
    await user.type(date, "2026-11-20");
    await user.click(within(dialog).getByRole("button", { name: "Duplicate" }));

    const toast = await screen.findByText("Duplicated Dentist to Friday, November 20, 2026");
    const [created, reminder] = await outbox();
    expect(created).toMatchObject({
      entity_type: "item",
      op: "create",
      data: {
        container_id: OWN,
        title: "Dentist",
        body: "Bring the card",
        location: "Main St 1",
        color: "red",
        priority: "high",
        start_date: "2026-11-20",
        start_time: "11:00",
        end_date: "2026-11-20",
        end_time: "12:00",
        rrule: null,
        copy_attachments_from: EVENT,
      },
    });
    expect(reminder).toMatchObject({
      entity_type: "reminder",
      op: "create",
      data: { item_id: created?.entity_id, offset_minutes: 30 },
    });
    expect(await outbox()).toHaveLength(2);
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(within(card).getByRole("heading", { name: "Dentist" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Nov 20");
    await user.keyboard("{Escape}");

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(String(created?.entity_id)))?.deleted_at).toBeTruthy();
    });
  });

  it("copies an occurrence of a series as a one-off event with the key D", async () => {
    const { user } = await openDay();
    await details(user, "Standup");
    await user.keyboard("d");
    const dialog = await screen.findByRole("dialog", { name: "Duplicate Standup" });
    expect(dialog).toHaveTextContent("the series stays as it is");
    expect(within(dialog).getByLabelText("Start date of the copy")).toHaveValue("2026-11-11");
    await user.click(within(dialog).getByRole("button", { name: "Duplicate" }));
    await screen.findByText("Duplicated Standup to Wednesday, November 11, 2026");
    expect(await outbox()).toMatchObject([
      {
        op: "create",
        data: { title: "Standup", start_date: "2026-11-11", end_date: "2026-11-11", rrule: null },
      },
    ]);
  });

  it("offers no Duplicate on a calendar shared for viewing", async () => {
    const { user } = await openDay("view");
    const card = await details(user, "Dentist");
    expect(within(card).queryByRole("button", { name: "Duplicate…" })).not.toBeInTheDocument();
    await user.keyboard("d");
    expect(screen.queryByRole("dialog", { name: "Duplicate Dentist" })).not.toBeInTheDocument();
  });
});
