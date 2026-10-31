// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. Event editor (FR-CAL-06/07, F-10/F-11/F-13, D-64): defaults (all day,
// the day shown, the user's colour), the first calendar created with the first event, 15-minute times and their
// defaults, end before start (shown, Save blocked) and the start taking the end along, repeat hiding the end date,
// editing sending only what changed with its starting values, undo, the unsaved-changes question, offline saving.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. No calendar is created with the first event any more: it goes to the
// default calendar, archived calendars are not offered (D-82).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  QUARTERS,
  changesOf,
  defaultTimes,
  eventData,
  formFromRow,
  newEventForm,
  slotsFor,
  validate,
  withStart,
} from "@/lib/eventForm";
import { localChanged } from "@/sync";
import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";

const USER = me().id;
const DAY = "2026-11-10"; // not today, so timed defaults start at 09:00
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const EVENT = "0199f000-0000-7000-8000-0000000000e1";

describe("form model", () => {
  it("defaults, quarter hours and slots", () => {
    expect(QUARTERS).toHaveLength(96);
    expect(defaultTimes("2026-11-10", "2026-11-10", "10:07")).toEqual({
      start_time: "10:15",
      end_time: "11:15",
      end_date: "2026-11-10",
    });
    expect(defaultTimes("2026-11-10", "2026-11-10", "10:15")).toMatchObject({ start_time: "10:30" });
    expect(defaultTimes("2026-11-11", "2026-11-10", "10:07")).toMatchObject({ start_time: "09:00", end_time: "10:00" });
    expect(defaultTimes("2026-11-10", "2026-11-10", "23:20")).toEqual({
      start_time: "23:30",
      end_time: "00:30",
      end_date: "2026-11-11",
    });
    expect(slotsFor("09:10")).toContain("09:10"); // a stored time off the grid stays selectable
  });

  it("a start after the end takes the end along; the end may not be before the start", () => {
    const allDay = newEventForm("2026-11-10", "brown", CAL);
    expect(withStart(allDay, { start_date: "2026-11-12" })).toMatchObject({
      start_date: "2026-11-12",
      end_date: "2026-11-12",
    });
    const timed = { ...allDay, all_day: "false" as const, start_time: "09:00", end_time: "10:00" };
    expect(withStart(timed, { start_time: "11:00" })).toMatchObject({ start_time: "11:00", end_time: "11:00" });
    expect(withStart(timed, { start_time: "09:30" })).toMatchObject({ end_time: "10:00" }); // still after: unchanged
    expect(validate({ ...timed, end_time: "08:45" })).toEqual({ end: "endBeforeStart" });
    expect(validate({ ...timed, title: "x".repeat(151) })).toEqual({ title: "tooLong" });
  });

  it("what is sent: no times for all-day events, one day for a series, only changes when editing", () => {
    const form = { ...newEventForm("2026-11-10", "blue", CAL), end_date: "2026-11-12", repeat: "weekly" as const };
    expect(eventData(form)).toMatchObject({
      all_day: true,
      start_time: null,
      end_date: "2026-11-10",
      rrule: "FREQ=WEEKLY",
    });
    const row = {
      id: EVENT,
      title: "(No title)",
      all_day: true,
      start_date: "2026-11-10",
      end_date: "2026-11-10",
      start_time: null,
      end_time: null,
      location: null,
      body: null,
      color: "brown",
      priority: "medium",
      rrule: null,
      container_id: CAL,
    };
    const edited = { ...formFromRow(row), location: "Room 4", calendar_id: "other" };
    expect(formFromRow(row).title).toBe(""); // "(No title)" shows as an empty field
    expect(changesOf(row, edited)).toEqual({ data: { location: "Room 4" }, base: { location: null }, moveTo: "other" });
  });
});

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Every user has a default calendar (D-82); new events start in it.
const DEFAULT_CAL = "0199f000-0000-7000-8000-0000000000c0";

async function openApp(extra: Parameters<typeof stubApi>[0] = {}) {
  const db = await localDb(USER);
  await db.calendars.bulkPut([
    { id: DEFAULT_CAL, name: "My calendar", owner_id: USER, is_default: true, deleted_at: null, version: 1 },
    {
      id: "0199f000-0000-7000-8000-0000000000c9",
      name: "Archive",
      owner_id: USER,
      archived_at: "2026-01-01T00:00:00Z",
      deleted_at: null,
      version: 1,
    },
  ]);
  // Pushes never answer here, so the outbox keeps what the editor wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined), ...extra });
  const { router } = renderApp(`/calendar?date=${DAY}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { router, user: userEvent.setup() };
}

describe("editor", { timeout: 15_000 }, () => {
  it("creates an all-day event in the default calendar; an archived calendar is not offered", async () => {
    const { user } = await openApp({ "GET /me/settings": () => json(settings({ default_color: "green" })) });
    await user.keyboard("n");
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    expect(within(dialog).getByRole("checkbox", { name: "All day" })).toBeChecked();
    expect(within(dialog).getByLabelText("From")).toHaveValue(DAY);
    const calendarSelect = within(dialog).getByRole("combobox", { name: "Calendar" });
    expect(calendarSelect).toHaveDisplayValue("My calendar");
    expect(
      within(calendarSelect)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["My calendar"]);
    await user.type(within(dialog).getByLabelText("Title"), "Dentist");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Event created: Dentist")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const [item, ...rest] = await outbox();
    expect(rest).toEqual([]);
    expect(item).toMatchObject({
      entity_type: "item",
      op: "create",
      data: {
        kind: "event",
        container_id: DEFAULT_CAL,
        title: "Dentist",
        all_day: true,
        start_date: DAY,
        end_date: DAY,
        start_time: null,
        color: "green",
        priority: "medium",
        rrule: null,
      },
    });
    expect(await screen.findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
  });

  // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Found by the end-to-end tests: right after signing in the calendars
  // may reach the device only after the user started typing; the touched form takes the default calendar then, so
  // Save does not stay disabled.
  it("takes the default calendar that arrives after the user started typing", async () => {
    stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
    renderApp(`/calendar?date=${DAY}`);
    await screen.findByRole("button", { name: /Account menu/ });
    const user = userEvent.setup();
    await user.keyboard("n");
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    await user.type(within(dialog).getByLabelText("Title"), "Dentist");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    const db = await localDb(USER);
    await db.calendars.put({
      id: DEFAULT_CAL,
      name: "My calendar",
      owner_id: USER,
      is_default: true,
      deleted_at: null,
      version: 1,
    });
    localChanged(USER);
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Dentist");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Event created: Dentist")).toBeInTheDocument();
    const [item] = await outbox();
    expect(item).toMatchObject({ op: "create", data: { container_id: DEFAULT_CAL, title: "Dentist" } });
  });

  it("timed: 15-minute defaults, end before start blocks Save, the start takes the end along; repeat hides To", async () => {
    const { user } = await openApp();
    await user.click(screen.getByRole("button", { name: "New event" }));
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    await user.click(within(dialog).getByRole("checkbox", { name: "All day" }));
    const start = within(dialog).getByRole("combobox", { name: "Start time" });
    const end = within(dialog).getByRole("combobox", { name: "End time" });
    expect(start).toHaveValue("09:00");
    expect(end).toHaveValue("10:00");
    expect(within(start).getAllByRole("option")).toHaveLength(96);

    await user.selectOptions(end, "08:00");
    expect(within(dialog).getByText("The end cannot be before the start.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.selectOptions(start, "11:00");
    expect(end).toHaveValue("11:00");
    expect(within(dialog).queryByText("The end cannot be before the start.")).not.toBeInTheDocument();

    expect(within(dialog).getByLabelText("To")).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Repeat" }), "weekly");
    expect(within(dialog).queryByLabelText("To")).not.toBeInTheDocument();
  });

  it("edits only what changed, with its starting values, and can be undone", async () => {
    const db = await localDb(USER);
    await db.calendars.put({ id: CAL, name: "Family", owner_id: USER, deleted_at: null, version: 1 });
    await db.items.put({
      id: EVENT,
      kind: "event",
      container_kind: "calendar",
      container_id: CAL,
      title: "Dentist",
      color: "blue",
      priority: "medium",
      all_day: true,
      start_date: DAY,
      end_date: DAY,
      start_time: null,
      end_time: null,
      tzid: me().time_zone,
      rrule: null,
      location: null,
      body: null,
      version: 3,
      deleted_at: null,
    });
    const { user } = await openApp();
    // +++===+++ 2026-10-23 — Hasan Alizada — HAAL-064. The row opens the details card; Edit is there.
    await user.click(await screen.findByRole("button", { name: "Details of Dentist" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Event details" })).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit event" });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Dentist");
    expect(within(dialog).getByRole("combobox", { name: "Calendar" })).toHaveDisplayValue("Family");
    await user.type(within(dialog).getByLabelText("Location"), "Main street 1");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const toast = await screen.findByText("Event saved: Dentist");
    const [update] = await outbox();
    expect(update).toMatchObject({
      op: "update",
      base_version: 3,
      base: { location: null },
      data: { location: "Main street 1" },
    });
    expect(update?.data).not.toHaveProperty("title");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // the editor has closed
    });
    const undo = within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" });
    await user.click(undo);
    await waitFor(async () => {
      expect((await db.items.get(EVENT))?.location).toBeNull();
    });
  });

  it("asks before closing with changes, and says offline saves stay on this device", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { user } = await openApp();
    await user.click(screen.getByRole("button", { name: "New event" }));
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    await user.type(within(dialog).getByLabelText("Title"), "Offline plan");
    await user.keyboard("{Escape}");
    const ask = await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Offline plan");

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Saved on this device. It will sync when the connection is back."),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
