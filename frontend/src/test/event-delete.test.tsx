// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-065. Deleting events (FR-CAL-09, F-16/F-17, D-66): from the details card
// and with the Delete key on the focused row, always after a confirmation (Delete → Enter); a series names all its
// occurrences; the delete is soft and goes through the outbox (works offline); undo restores it; a calendar shared for
// viewing is refused with a message. The day list has one Tab stop and moves with ↑/↓.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const SHARED = "0199f000-0000-7000-8000-0000000000c2";
const DENTIST = "0199f000-0000-7000-8000-0000000000e1";
const STANDUP = "0199f000-0000-7000-8000-0000000000e2";
const PARTY = "0199f000-0000-7000-8000-0000000000e3";
const DAY = "2026-11-10";

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
  const timed = (start: string, end: string) => ({ all_day: false, start_time: start, end_time: end });
  await db.items.bulkPut([
    {
      ...common,
      ...timed("09:00", "09:30"),
      id: DENTIST,
      container_id: OWN,
      title: "Dentist",
      start_date: DAY,
      end_date: DAY,
      rrule: null,
    },
    {
      ...common,
      ...timed("10:00", "10:15"),
      id: STANDUP,
      container_id: OWN,
      title: "Standup",
      start_date: "2026-11-03",
      end_date: "2026-11-03",
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

describe("deleting events", { timeout: 15_000 }, () => {
  it("from the details card: asks, deletes softly through the outbox, undo restores", async () => {
    const { user, db } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    await user.click(within(card).getByRole("button", { name: "Delete" }));

    const ask = await screen.findByRole("dialog", { name: "Delete event?" });
    expect(ask).toHaveTextContent("“Dentist” will be moved to the trash.");
    expect(within(ask).getByRole("button", { name: "Delete" })).toHaveFocus(); // Delete → Enter
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delete event?" })).not.toBeInTheDocument();
    });
    expect(await outbox()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Details of Dentist" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Delete" }),
    );
    await user.keyboard("{Enter}");
    const toast = await screen.findByText("Deleted Dentist");
    expect(await outbox()).toMatchObject([{ entity_id: DENTIST, op: "delete", base_version: 4 }]);
    expect((await db.items.get(DENTIST))?.deleted_at).toBeTruthy(); // soft: the row stays, marked deleted
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Dentist" })).not.toBeInTheDocument();
    });

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
    // The delete had not been sent yet: the restore cancels it in the outbox, nothing goes to the server.
    expect(await outbox()).toHaveLength(0);
    expect((await db.items.get(DENTIST))?.deleted_at).toBeFalsy();
  });

  it("Delete key on the focused row; a series names all its occurrences; arrows move the focus", async () => {
    const { user } = await openDay();
    const party = await screen.findByRole("button", { name: "Details of Party" });
    const dentist = screen.getByRole("button", { name: "Details of Dentist" });
    const standup = screen.getByRole("button", { name: "Details of Standup" });
    expect(party).toHaveAttribute("tabindex", "0"); // one Tab stop: the all-day event comes first
    expect(dentist).toHaveAttribute("tabindex", "-1");
    party.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(standup).toHaveFocus();

    await user.keyboard("{Delete}");
    const ask = await screen.findByRole("dialog", { name: "Delete event?" });
    expect(ask).toHaveTextContent("All occurrences of the repeating event “Standup” will be moved to the trash.");
    await user.keyboard("{Enter}");
    await screen.findByText("Deleted Standup");
    expect(await outbox()).toMatchObject([{ entity_id: STANDUP, op: "delete" }]);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Standup" })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(document.activeElement?.getAttribute("data-nav-id")).toBeTruthy(); // the focus stays in the list
    });
  });

  it("Delete key inside an open card asks too", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    await screen.findByRole("dialog", { name: "Event details" });
    await user.keyboard("{Delete}");
    expect(await screen.findByRole("dialog", { name: "Delete event?" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
  });

  it("a calendar shared for viewing: no Delete in the card, the key says why", async () => {
    const { user } = await openDay();
    const party = await screen.findByRole("button", { name: "Details of Party" });
    await user.click(party);
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(within(card).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });
    party.focus();
    await user.keyboard("{Delete}");
    expect(await screen.findByText("This calendar is view only — the event cannot be deleted.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Delete event?" })).not.toBeInTheDocument();
    expect(await outbox()).toHaveLength(0);
  });
});
