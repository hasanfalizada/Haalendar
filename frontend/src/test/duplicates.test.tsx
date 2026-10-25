// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-080. Duplicate-title warning (FR-CAL-16, D-69): matching (trimmed,
// case-insensitive, accents kept, Unicode-normalised, never "(No title)", deleted events and the event itself left out),
// the day a duplicate is shown on, and the warning on Save: Back keeps editing (focused), Save anyway saves, an
// unchanged title is not checked, Show opens the other event on its day.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { dayToShow, findDuplicates, titleKey } from "@/lib/duplicates";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const OWN = "0199f000-0000-7000-8000-0000000000c1";
const SHARED = "0199f000-0000-7000-8000-0000000000c2";
const DENTIST = "0199f000-0000-7000-8000-0000000000e1";
const STANDUP = "0199f000-0000-7000-8000-0000000000e2";
const DAY = "2026-11-10";

const common = { kind: "event", container_kind: "calendar", deleted_at: null, version: 1, tzid: me().time_zone };
const dentist = {
  ...common,
  id: DENTIST,
  container_id: SHARED,
  title: "Dentist",
  color: "blue",
  priority: "medium",
  all_day: true,
  start_date: "2026-12-01",
  end_date: "2026-12-01",
  rrule: null,
};
const standup = {
  ...common,
  id: STANDUP,
  container_id: OWN,
  title: "Standup",
  color: "green",
  priority: "medium",
  all_day: true,
  start_date: DAY,
  end_date: DAY,
  rrule: null,
};

describe("matching", () => {
  it("compares trimmed, case-insensitive, accents kept; never empty titles", () => {
    expect(titleKey("  ZAHNARZT ")).toBe(titleKey("zahnarzt"));
    expect(titleKey("Café")).toBe(titleKey("café".toUpperCase())); // composed and decomposed é
    expect(titleKey("Café")).not.toBe(titleKey("Cafe"));
    expect(titleKey("")).toBe("");
    expect(titleKey("(No title)")).toBe("");
    const rows = [
      dentist,
      { ...dentist, id: "deleted", deleted_at: "2026-11-01T00:00:00Z" },
      { id: "n", kind: "note", title: "Dentist" },
    ];
    expect(findDuplicates(rows, " dentist ").map((r) => r.id)).toEqual([DENTIST]);
    expect(findDuplicates(rows, "Dentist", [DENTIST])).toEqual([]);
    expect(findDuplicates([{ ...dentist, title: "(No title)" }], "")).toEqual([]);
  });

  it("shows a one-off event on its day and a series on its next occurrence", () => {
    expect(dayToShow(dentist, DAY, "UTC")).toBe("2026-12-01");
    const weekly = { ...dentist, start_date: "2026-11-02", end_date: "2026-11-02", rrule: "FREQ=WEEKLY" };
    expect(dayToShow(weekly, DAY, "UTC")).toBe("2026-11-16");
    expect(dayToShow({ ...weekly, exceptions: ["2026-11-16"] }, DAY, "UTC")).toBe("2026-11-23");
  });
});

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
  await db.items.bulkPut([dentist, standup]);
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

describe("the warning", { timeout: 20_000 }, () => {
  it("asks before creating a duplicate; Back keeps editing, Save anyway saves", async () => {
    const { user } = await openDay();
    await user.click(screen.getAllByRole("button", { name: "New event" })[0]!);
    const editor = await screen.findByRole("dialog", { name: "New event" });
    await user.type(within(editor).getByLabelText("Title"), "  DENTIST ");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    const warning = await screen.findByRole("dialog", { name: "An event with this title already exists" });
    expect(warning).toHaveTextContent("Another event has the same title.");
    expect(within(warning).getByRole("list", { name: "Events with the same title" })).toHaveTextContent(
      "Dentist" + "Dec 1, 2026 · Family",
    );
    expect(within(warning).getByRole("button", { name: "Back to editing" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "An event with this title already exists" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("dialog", { name: "New event" })).toBeInTheDocument();
    expect(await outbox()).toHaveLength(0);

    await user.click(within(editor).getByRole("button", { name: "Save" }));
    const again = await screen.findByRole("dialog", { name: "An event with this title already exists" });
    await user.click(within(again).getByRole("button", { name: "Save anyway" }));
    await waitFor(async () => {
      expect((await outbox()).map((entry) => entry.op)).toContain("create");
    });
  });

  it("checks an edit only when the title changes", async () => {
    const { user } = await openDay();
    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Edit" }),
    );
    const editor = await screen.findByRole("dialog", { name: "Edit event" });
    await user.type(within(editor).getByLabelText("Location"), "Room 4");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Event saved: Standup"); // the unchanged title is not checked

    await user.click(await screen.findByRole("button", { name: "Details of Standup" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Edit" }),
    );
    const second = await screen.findByRole("dialog", { name: "Edit event" });
    await user.clear(within(second).getByLabelText("Title"));
    await user.type(within(second).getByLabelText("Title"), "dentist");
    await user.click(within(second).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("dialog", { name: "An event with this title already exists" })).toBeInTheDocument();
  });

  it("Show opens the other event on its day", async () => {
    const { user } = await openDay();
    await user.click(screen.getAllByRole("button", { name: "New event" })[0]!);
    const editor = await screen.findByRole("dialog", { name: "New event" });
    await user.type(within(editor).getByLabelText("Title"), "Dentist");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    const warning = await screen.findByRole("dialog", { name: "An event with this title already exists" });
    await user.click(within(warning).getByRole("button", { name: "Show Dentist" }));

    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(card).toHaveTextContent("Dentist");
    expect(card).toHaveTextContent("Family");
    expect(screen.queryByRole("dialog", { name: "New event" })).not.toBeInTheDocument();
    expect(await outbox()).toHaveLength(0);
  });
});
