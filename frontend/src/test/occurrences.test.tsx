// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. Single occurrences of a series (FR-CAL-11..14, D-67): excluded dates
// are not shown; Delete and Edit of a repeating event ask "only this occurrence or all?" (this has the focus); deleting
// one date writes `exclude` (undo brings it back), all deletes the series; editing one date works on a one-off copy that
// is written only on Save (copy + exclude with its id), Cancel writes nothing; the series opens at its effective start;
// opposite exclude / include of one date cancel each other in the outbox.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { effectiveStart, entriesOn } from "@/lib/dayView";
import { formFromRow } from "@/lib/eventForm";
import { mutate } from "@/sync";
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
  rrule: "FREQ=DAILY",
  location: "Room 4",
  body: "Daily sync",
  exceptions: ["2026-11-11"],
  deleted_at: null,
  version: 3,
};

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function openDay() {
  const db = await localDb(USER);
  await db.calendars.put({ id: OWN, name: "Work", owner_id: USER, deleted_at: null });
  await db.items.put(series);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${DAY}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db };
}

describe("excluded dates and the effective start", () => {
  it("leaves excluded dates out and opens a series at its first remaining occurrence", () => {
    const tz = me().time_zone;
    expect(entriesOn([series], "2026-11-10", tz).map((e) => e.title)).toEqual(["Standup"]);
    expect(entriesOn([series], "2026-11-11", tz)).toEqual([]);
    expect(effectiveStart("2026-11-03", "FREQ=DAILY", ["2026-11-03", "2026-11-04"])).toBe("2026-11-05");
    expect(effectiveStart("2026-11-03", "FREQ=DAILY", ["2026-11-05"])).toBe("2026-11-03");
    expect(effectiveStart("2026-01-31", "FREQ=MONTHLY", ["2026-01-31"])).toBe("2026-03-31");
    const leading = { ...series, exceptions: ["2026-11-03"] };
    expect(formFromRow(leading)).toMatchObject({ start_date: "2026-11-04", end_date: "2026-11-04", repeat: "daily" });
    expect(formFromRow(series, DAY)).toMatchObject({ start_date: DAY, end_date: DAY, repeat: "none" });
  });

  it("cancels an exclude and an include of the same date in the outbox, not of different dates", async () => {
    const db = await localDb(USER);
    await db.items.put(series);
    const target = { entity_type: "item" as const, entity_id: SERIES };
    await mutate(USER, { ...target, op: "exclude", data: { occurrence_date: "2026-11-05" } });
    expect((await db.items.get(SERIES))?.exceptions).toEqual(["2026-11-05", "2026-11-11"]);
    await mutate(USER, { ...target, op: "include", data: { occurrence_date: "2026-11-05" } });
    expect(await outbox()).toHaveLength(0);
    expect((await db.items.get(SERIES))?.exceptions).toEqual(["2026-11-11"]);
    await mutate(USER, { ...target, op: "exclude", data: { occurrence_date: "2026-11-05" } });
    await mutate(USER, { ...target, op: "include", data: { occurrence_date: "2026-11-11" } });
    expect((await outbox()).map((entry) => entry.op)).toEqual(["exclude", "include"]);
  });
});

describe("one occurrence or all", { timeout: 20_000 }, () => {
  it("Delete asks; only this occurrence excludes the date, undo brings it back", async () => {
    const { user, db } = await openDay();
    const row = await screen.findByRole("button", { name: "Details of Standup" });
    row.focus();
    await user.keyboard("{Delete}");
    const ask = await screen.findByRole("dialog", { name: "Delete repeating event?" });
    expect(ask).toHaveTextContent(DAY_LABEL);
    expect(within(ask).getByRole("button", { name: "Only this occurrence" })).toHaveFocus();
    await user.keyboard("{Enter}");

    const toast = await screen.findByText(`Deleted Standup on ${DAY_LABEL}`);
    expect(await outbox()).toMatchObject([{ entity_id: SERIES, op: "exclude", data: { occurrence_date: DAY } }]);
    expect((await db.items.get(SERIES))?.exceptions).toEqual([DAY, "2026-11-11"]);
    expect((await db.items.get(SERIES))?.deleted_at).toBeNull(); // the series stays
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Standup" })).not.toBeInTheDocument();
    });

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Details of Standup" })).toBeInTheDocument();
    // Not sent yet: exclude and include cancel out. If the sync engine already took the exclude, the include follows it.
    const ops = (await outbox()).map((entry) => entry.op);
    expect(ops.length === 0 || (ops[0] === "exclude" && ops[1] === "include" && ops.length === 2)).toBe(true);
  });

  it("all occurrences deletes the series", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Delete" }),
    );
    const ask = await screen.findByRole("dialog", { name: "Delete repeating event?" });
    await user.click(within(ask).getByRole("button", { name: "All occurrences" }));
    await screen.findByText("Deleted Standup");
    expect(await outbox()).toMatchObject([{ entity_id: SERIES, op: "delete", base_version: 3 }]);
  });

  it("edit only this occurrence: a one-off copy written on Save together with the exclusion", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Edit" }),
    );
    const ask = await screen.findByRole("dialog", { name: "Edit repeating event?" });
    await user.click(within(ask).getByRole("button", { name: "Only this occurrence" }));

    const editor = await screen.findByRole("dialog", { name: `Edit the occurrence on ${DAY_LABEL}` });
    expect(within(editor).queryByLabelText("Repeat")).not.toBeInTheDocument();
    expect(within(editor).queryByLabelText("Calendar")).not.toBeInTheDocument();
    expect(editor).toHaveTextContent("Attachments stay with the series.");
    expect(within(editor).getByLabelText("Title")).toHaveValue("Standup");
    expect(within(editor).getByLabelText("Location")).toHaveValue("Room 4");
    await user.clear(within(editor).getByLabelText("Location"));
    await user.type(within(editor).getByLabelText("Location"), "Room 7");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    await screen.findByText("Saved Standup as a separate event");
    const [copy, exclusion] = await outbox();
    expect(copy).toMatchObject({
      op: "create",
      data: {
        kind: "event",
        container_id: OWN,
        start_date: DAY,
        end_date: DAY,
        start_time: "10:00",
        location: "Room 7",
        rrule: null,
      },
    });
    expect(exclusion).toMatchObject({
      entity_id: SERIES,
      op: "exclude",
      data: { occurrence_date: DAY, override_event_id: copy?.entity_id },
    });
  });

  it("edit only this occurrence, then Cancel: nothing is written", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    await user.keyboard("e");
    await user.keyboard("{Enter}"); // "Only this occurrence" has the focus
    const editor = await screen.findByRole("dialog", { name: `Edit the occurrence on ${DAY_LABEL}` });
    await user.click(within(editor).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await outbox()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Details of Standup" })).toBeInTheDocument();
  });

  it("edit all occurrences opens the series", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    await user.keyboard("e");
    const ask = await screen.findByRole("dialog", { name: "Edit repeating event?" });
    await user.click(within(ask).getByRole("button", { name: "All occurrences" }));
    const editor = await screen.findByRole("dialog", { name: "Edit event" });
    expect(within(editor).getByLabelText("Repeat")).toHaveValue("daily");
    expect(within(editor).getByLabelText("From")).toHaveValue("2026-11-03");
  });
});
