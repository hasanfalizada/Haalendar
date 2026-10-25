// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-081. Colour from the details card (FR-CAL-18, D-70): a choice is saved
// through the outbox with the old colour as base, the row recolours, undo brings the old colour back; running through
// the palette with the arrow keys writes once; a choice still waiting is written when the card closes; a series shows
// the hint; a calendar shared for viewing shows the colour only.
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

const base = {
  kind: "event",
  container_kind: "calendar",
  deleted_at: null,
  version: 2,
  tzid: me().time_zone,
  priority: "medium",
  all_day: true,
  start_date: DAY,
  end_date: DAY,
  rrule: null,
};

async function openDay() {
  const db = await localDb(USER);
  await db.calendars.bulkPut([
    { id: OWN, name: "Work", owner_id: USER, deleted_at: null },
    { id: SHARED, name: "Family", owner_id: "someone-else", deleted_at: null },
  ]);
  await db.shares.put({
    id: "s1",
    container_kind: "calendar",
    container_id: SHARED,
    grantee_id: USER,
    permission: "view",
    revoked_at: null,
  });
  await db.items.bulkPut([
    { ...base, id: DENTIST, container_id: OWN, title: "Dentist", color: "blue" },
    {
      ...base,
      id: STANDUP,
      container_id: OWN,
      title: "Standup",
      color: "green",
      start_date: "2026-11-02",
      end_date: "2026-11-02",
      rrule: "FREQ=DAILY",
    },
    { ...base, id: PARTY, container_id: SHARED, title: "Party", color: "red" },
  ]);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${DAY}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function card(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole("button", { name: `Details of ${title}` }));
  return screen.findByRole("dialog", { name: "Event details" });
}

describe("colour from the details card", { timeout: 20_000 }, () => {
  it("saves the chosen colour with the old one as base; undo brings it back", async () => {
    const { user, db } = await openDay();
    const details = await card(user, "Dentist");
    expect(within(details).getByRole("radio", { name: "Blue" })).toBeChecked();
    await user.click(within(details).getByRole("radio", { name: "Purple" }));

    const toast = await screen.findByText("Color changed: Dentist");
    expect(await outbox()).toMatchObject([
      { entity_id: DENTIST, op: "update", base_version: 2, base: { color: "blue" }, data: { color: "purple" } },
    ]);
    expect((await db.items.get(DENTIST))?.color).toBe("purple");

    // On phones the sheet is modal: the toast can be used once the card is closed.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(DENTIST))?.color).toBe("blue");
    });
  });

  it("running through the palette with the arrow keys writes once", async () => {
    const { user } = await openDay();
    const details = await card(user, "Dentist");
    within(details).getByRole("radio", { name: "Blue" }).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    expect(details).toBeInTheDocument(); // the arrows did not change the day
    await screen.findByText("Color changed: Dentist");
    const writes = await outbox();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ base: { color: "blue" } });
    expect(writes[0]?.data?.color).not.toBe("blue");
    // Still the same day (the card covers the list on phones, so hidden rows count).
    expect(screen.getByRole("button", { name: "Details of Dentist", hidden: true })).toBeInTheDocument();
  });

  it("writes a waiting choice when the card closes", async () => {
    const { user } = await openDay();
    const details = await card(user, "Dentist");
    await user.click(within(details).getByRole("radio", { name: "Orange" }));
    await user.keyboard("{Escape}"); // well within the 0.6 s wait
    await waitFor(async () => {
      expect(await outbox()).toMatchObject([{ entity_id: DENTIST, data: { color: "orange" } }]);
    });
  });

  it("a series changes as a whole; a view-only calendar shows the colour only", async () => {
    const { user } = await openDay();
    const series = await card(user, "Standup");
    expect(series).toHaveTextContent("Applies to all occurrences.");
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Event details" })).not.toBeInTheDocument();
    });
    const party = await card(user, "Party");
    expect(within(party).queryByRole("radio")).not.toBeInTheDocument();
    expect(party).toHaveTextContent("Red");
  });
});
