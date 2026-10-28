// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-083, D-72. Day-list rows show a description icon when the description
// has visible text (Markdown stripped) and a paperclip when the event has active attachments (local database); screen
// readers get both, with the repeat flag, as the row's accessible description while its name stays "Details of …".
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { entriesOn } from "@/lib/dayView";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const DAY = "2026-10-22";
let next = 0;

function event(fields: Record<string, unknown>): Record<string, unknown> {
  next += 1;
  return {
    id: `0199f000-0000-7000-8000-${String(next).padStart(12, "0")}`,
    kind: "event",
    container_kind: "calendar",
    container_id: CAL,
    title: "Event",
    color: "brown",
    all_day: true,
    start_date: DAY,
    end_date: DAY,
    start_time: null,
    end_time: null,
    tzid: me().time_zone,
    rrule: null,
    location: null,
    body: null,
    deleted_at: null,
    created_at: "2026-10-01T10:00:00Z",
    ...fields,
  };
}

function attachment(itemId: string, id: string, deleted = false): Record<string, unknown> {
  return {
    id,
    item_id: itemId,
    container_kind: "calendar",
    container_id: CAL,
    file_name: `${id}.pdf`,
    media_type: "application/pdf",
    size_bytes: 1024,
    deleted_at: deleted ? "2026-10-21T10:00:00Z" : null,
  };
}

describe("hasDescription", () => {
  it.each([
    [null, false],
    ["", false],
    ["   \n  ", false],
    ["**  **", false],
    ["Bring the slides", true],
    ["- [ ] call Bob", true],
  ])("body %j → %s", (body, expected) => {
    const [entry] = entriesOn([event({ body })], DAY, me().time_zone);
    expect(entry?.hasDescription).toBe(expected);
  });
});

describe("indicator icons in the day list", () => {
  it("shows the description and attachment icons and describes them for screen readers", async () => {
    const plain = event({ title: "Plain", body: "   " });
    const noted = event({ title: "Noted", body: "Agenda: *budget*" });
    const files = event({ title: "Files" });
    const both = event({ title: "Both", body: "See the plan", rrule: "FREQ=WEEKLY" });
    const db = await localDb(USER);
    await db.items.bulkPut([plain, noted, files, both]);
    await db.attachments.bulkPut([
      attachment(String(files.id), "a1"),
      attachment(String(both.id), "a2"),
      attachment(String(both.id), "a3"),
      attachment(String(plain.id), "a4", true), // deleted: no paperclip
    ]);
    stubApi({ "GET /me": () => json(me()) });
    renderApp(`/calendar?date=${DAY}`);

    const row = async (title: string) => screen.findByRole("button", { name: `Details of ${title}` });

    const plainRow = await row("Plain");
    expect(within(plainRow).queryByTitle("Has a description")).not.toBeInTheDocument();
    expect(within(plainRow).queryByTitle(/attachment/)).not.toBeInTheDocument();
    expect(plainRow).not.toHaveAttribute("aria-describedby");

    const notedRow = await row("Noted");
    expect(within(notedRow).getByTitle("Has a description")).toBeInTheDocument();
    expect(notedRow).toHaveAccessibleDescription("has a description");

    const filesRow = await row("Files");
    await waitFor(() => {
      expect(within(filesRow).getByTitle("1 attachment")).toBeInTheDocument();
    });
    expect(filesRow).toHaveAccessibleDescription("1 attachment");

    const bothRow = await row("Both");
    await waitFor(() => {
      expect(bothRow).toHaveAccessibleDescription("repeats, has a description, 2 attachments");
    });
    expect(within(bothRow).getByTitle("2 attachments")).toBeInTheDocument();
  });
});
