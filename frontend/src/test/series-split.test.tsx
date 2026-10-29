// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-093. "This and following" in the app (FR-CAL-31, D-81): delete ends the
// series the day before (undo brings the dates back), at the first remaining occurrence it deletes the whole series;
// edit saves the later part as a new series (the series' fields, the remaining count, the excluded dates along) only
// when something changed.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const SERIES = "0199f000-0000-7000-8000-0000000000e1";
const DAY = "2026-11-10";
const DAY_LABEL = "Tuesday, November 10, 2026";

const series = {
  id: SERIES,
  kind: "event",
  container_kind: "calendar",
  container_id: OWN,
  title: "Standup",
  color: "green",
  priority: "medium",
  all_day: false,
  start_date: "2026-11-03",
  end_date: "2026-11-03",
  start_time: "10:00",
  end_time: "10:15",
  tzid: me().time_zone,
  rrule: "FREQ=DAILY;COUNT=20",
  location: "Room 4",
  body: null,
  exceptions: ["2026-11-12"],
  deleted_at: null,
  version: 3,
};

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function openDay(day = DAY) {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.put(series);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${day}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

async function ask(user: ReturnType<typeof userEvent.setup>, action: "Delete" | "Edit") {
  await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
  await user.click(
    within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: action }),
  );
  return screen.findByRole("dialog", { name: `${action} repeating event?` });
}

describe("this and following", { timeout: 15_000 }, () => {
  it("delete ends the series the day before; undo brings the dates back", async () => {
    const { user, db } = await openDay();
    const dialog = await ask(user, "Delete");
    expect(within(dialog).getByRole("button", { name: "Only this occurrence" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "This and following" }));

    const toast = await screen.findByText(`Deleted Standup from ${DAY_LABEL} on`);
    expect(await outbox()).toMatchObject([
      {
        entity_id: SERIES,
        op: "update",
        base_version: 3,
        base: { rrule: "FREQ=DAILY;COUNT=20" },
        data: { rrule: "FREQ=DAILY;UNTIL=20261109" },
      },
    ]);
    expect(await db.items.get(SERIES)).toMatchObject({ deleted_at: null, exceptions: ["2026-11-12"] });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Standup" })).not.toBeInTheDocument();
    });

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Details of Standup" })).toBeInTheDocument();
    expect((await db.items.get(SERIES))?.rrule).toBe("FREQ=DAILY;COUNT=20");
  });

  it("at the first occurrence it deletes the whole series", async () => {
    const { user } = await openDay("2026-11-03");
    const dialog = await ask(user, "Delete");
    await user.click(within(dialog).getByRole("button", { name: "This and following" }));
    await screen.findByText("Deleted Standup");
    expect(await outbox()).toMatchObject([{ entity_id: SERIES, op: "delete", base_version: 3 }]);
  });

  it("edit saves the later part as a new series with the remaining count and the excluded dates", async () => {
    const { user, db } = await openDay();
    const dialog = await ask(user, "Edit");
    await user.click(within(dialog).getByRole("button", { name: "This and following" }));

    const editor = await screen.findByRole("dialog", { name: `Edit the occurrences from ${DAY_LABEL} on` });
    expect(editor).toHaveTextContent("Saving ends the series on Monday, November 9, 2026");
    expect(within(editor).getByLabelText("From")).toHaveValue(DAY);
    expect(within(editor).getByLabelText("Calendar")).toBeInTheDocument();
    expect(within(editor).getByText("Every day, 13 times")).toBeInTheDocument();
    await user.clear(within(editor).getByLabelText("Location"));
    await user.type(within(editor).getByLabelText("Location"), "Room 7");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    await screen.findByText(`Saved Standup from ${DAY_LABEL} on`);
    const [end, created, excluded] = await outbox();
    expect(end).toMatchObject({ entity_id: SERIES, op: "update", data: { rrule: "FREQ=DAILY;UNTIL=20261109" } });
    expect(created).toMatchObject({
      op: "create",
      data: {
        kind: "event",
        container_id: OWN,
        title: "Standup",
        start_date: DAY,
        end_date: DAY,
        start_time: "10:00",
        location: "Room 7",
        rrule: "FREQ=DAILY;COUNT=13",
      },
    });
    expect(excluded).toMatchObject({
      entity_id: created?.entity_id,
      op: "exclude",
      data: { occurrence_date: "2026-11-12" },
    });
    expect(await db.items.get(String(created?.entity_id))).toMatchObject({ exceptions: ["2026-11-12"] });
    // No warning about a duplicate title: the series it came from does not count.
    expect(screen.queryByRole("dialog", { name: /same title/i })).not.toBeInTheDocument();
  });

  it("edit without a change writes nothing", async () => {
    const { user } = await openDay();
    const dialog = await ask(user, "Edit");
    await user.click(within(dialog).getByRole("button", { name: "This and following" }));
    const editor = await screen.findByRole("dialog", { name: `Edit the occurrences from ${DAY_LABEL} on` });
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await outbox()).toHaveLength(0);
  });
});
