// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Extended repeat rules in the app (FR-CAL-30, D-80): the presets of
// the start date, Custom… (every N, weekdays, ends after N times) saved as RRULE, turning off the start's weekday moving
// the start, a rule the start no longer fits blocking Save, the card's text and a stored custom rule opening in
// Custom…, and a series with chosen weekdays moving only one occurrence to another day.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const DAY = "2026-11-10"; // a Tuesday, the second of the month
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const SERIES = "0199f000-0000-7000-8000-0000000000e1";

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function openApp(items: Record<string, unknown>[] = []) {
  const db = await localDb(USER);
  await db.calendars.put({ id: CAL, name: "Family", owner_id: USER, deleted_at: null, version: 1 });
  await db.items.bulkPut(items);
  // Pushes never answer here, so the outbox keeps what the editor wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/calendar?date=${DAY}`);
  await screen.findByRole("button", { name: /Account menu/ });
  return { db, user: userEvent.setup() };
}

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("repeat rules", { timeout: 15_000 }, () => {
  it("presets follow the date; Custom… saves every 2 weeks on Tuesday and Thursday, 6 times", async () => {
    const { user } = await openApp();
    await user.click(screen.getByRole("button", { name: "New event" }));
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    await user.type(within(dialog).getByLabelText("Title"), "Training");
    const repeat = within(dialog).getByRole("combobox", { name: "Repeat" });
    expect(optionTexts(repeat)).toEqual([
      "Does not repeat",
      "Every day",
      "Every week on Tuesday",
      "Every month on day 10",
      "Every month on the second Tuesday",
      "Every year on November 10",
      "Custom…",
    ]);

    await user.selectOptions(repeat, "Custom…");
    const custom = within(dialog).getByRole("group", { name: "Custom repeat" });
    expect(within(custom).getByRole("combobox", { name: "Repeat unit" })).toHaveDisplayValue("week");
    const interval = within(custom).getByRole("spinbutton", { name: "Every" });
    await user.clear(interval);
    await user.type(interval, "2");
    const days = within(custom).getByRole("group", { name: "Days of the week" });
    expect(within(days).getByRole("button", { name: "Tuesday" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(days).getByRole("button", { name: "Thursday" }));
    await user.click(within(custom).getByRole("radio", { name: "After" }));
    const count = within(custom).getByRole("spinbutton", { name: "Number of occurrences" });
    await user.clear(count);
    await user.type(count, "6");
    expect(within(dialog).getByText("Every 2 weeks on Tue and Thu, 6 times")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Event created: Training");
    const [item] = await outbox();
    expect(item).toMatchObject({
      op: "create",
      data: { title: "Training", start_date: DAY, end_date: DAY, rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6" },
    });
  });

  it("turning off the start's weekday moves the start; a rule the date no longer fits blocks Save", async () => {
    const { user } = await openApp();
    await user.click(screen.getByRole("button", { name: "New event" }));
    const dialog = await screen.findByRole("dialog", { name: "New event" });
    const repeat = within(dialog).getByRole("combobox", { name: "Repeat" });
    await user.selectOptions(repeat, "Custom…");
    const days = within(dialog).getByRole("group", { name: "Days of the week" });
    await user.click(within(days).getByRole("button", { name: "Friday" }));
    await user.click(within(days).getByRole("button", { name: "Tuesday" }));
    expect(within(dialog).getByLabelText("From")).toHaveValue("2026-11-13"); // the next Friday
    expect(within(days).getByRole("button", { name: "Friday" })).toHaveAttribute("aria-pressed", "true");

    await user.selectOptions(repeat, "Every month on the second Friday");
    // 30 November is the fifth Monday: no "second Friday" and no Nth weekday at all.
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-11-30" } });
    expect(
      within(dialog).getByText("The start date is not one of the repeat dates — change the date or the rule."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(optionTexts(repeat)).toContain("Every month on the last day");
    await user.selectOptions(repeat, "Every month on the last day");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("the card reads the rule; a custom rule opens in Custom…", async () => {
    const { user } = await openApp([
      {
        id: SERIES,
        kind: "event",
        container_kind: "calendar",
        container_id: CAL,
        title: "Training",
        color: "blue",
        priority: "medium",
        all_day: true,
        start_date: "2026-10-27",
        end_date: "2026-10-27",
        start_time: null,
        end_time: null,
        tzid: me().time_zone,
        rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261231",
        location: null,
        body: null,
        version: 2,
        deleted_at: null,
      },
    ]);
    await user.click(await screen.findByRole("button", { name: "Details of Training" }));
    const card = await screen.findByRole("dialog", { name: "Event details" });
    expect(card).toHaveTextContent("Repeats: Every 2 weeks on Tue and Thu, until Dec 31, 2026");
    await user.click(within(card).getByRole("button", { name: "Edit" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit repeating event?" })).getByRole("button", {
        name: "All occurrences",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit event" });
    expect(within(dialog).getByRole("combobox", { name: "Repeat" })).toHaveDisplayValue("Custom…");
    const custom = within(dialog).getByRole("group", { name: "Custom repeat" });
    expect(within(custom).getByRole("spinbutton", { name: "Every" })).toHaveValue(2);
    expect(within(custom).getByRole("radio", { name: "On" })).toBeChecked();
    expect(within(custom).getByLabelText("End date")).toHaveValue("2026-12-31");
    // Unchanged: nothing to save but the dialog closes.
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit event" })).not.toBeInTheDocument();
    });
    expect(await outbox()).toEqual([]);
  });
});
