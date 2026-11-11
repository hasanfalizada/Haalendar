// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Reminders on the client (D-79): labels of both forms, equal keys,
// the user's active reminders of an item in firing order, the editor's text field, and the day and time a reminder
// notification is about in the reader's zone.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Cards (D-94): what a card's reminder is about, when one fires from the
// due date and time, and whether one is still ahead.
import "@/i18n";
import { describe, expect, it } from "vitest";

import {
  cardFireTime,
  cardReminderAhead,
  cardReminderWhen,
  reminderLabel,
  reminderWhen,
  remindersOf,
  specKey,
  specsFromText,
  specsText,
} from "./reminders";

describe("reminder labels", () => {
  it("names both forms", () => {
    const label = (spec: Parameters<typeof reminderLabel>[0]) => reminderLabel(spec, "24h");
    expect(label({ offset_minutes: 0 })).toBe("At the start");
    expect(label({ offset_minutes: 1 })).toBe("1 minute before");
    expect(label({ offset_minutes: 15 })).toBe("15 minutes before");
    expect(label({ offset_minutes: 120 })).toBe("2 hours before");
    expect(label({ offset_minutes: 90 })).toBe("90 minutes before");
    expect(label({ offset_minutes: 1440 })).toBe("1 day before");
    expect(label({ offset_minutes: 20160 })).toBe("2 weeks before");
    expect(label({ all_day_time: "09:00", all_day_days_before: 0 })).toBe("On the day at 09:00");
    expect(label({ all_day_time: "18:30", all_day_days_before: 2 })).toBe("2 days before at 18:30");
    expect(reminderLabel({ all_day_time: "18:30", all_day_days_before: 1 }, "12h")).toBe("1 day before at 6:30 PM");
  });
});

describe("reminders of an item", () => {
  it("keeps the active ones of the item, earliest first, and tells equal ones by key", () => {
    const rows = [
      { id: "r1", item_id: "e1", offset_minutes: 15, deleted_at: null },
      { id: "r2", item_id: "e1", all_day_time: "09:00:00", all_day_days_before: 1, deleted_at: null },
      { id: "r3", item_id: "e1", offset_minutes: 60, deleted_at: "2026-10-28T10:00:00Z" },
      { id: "r4", item_id: "e2", offset_minutes: 5, deleted_at: null },
    ];
    expect(remindersOf(rows, "e1")).toEqual([
      { id: "r2", spec: { all_day_time: "09:00", all_day_days_before: 1 } },
      { id: "r1", spec: { offset_minutes: 15 } },
    ]);
    expect(specKey({ offset_minutes: 15 })).toBe(specKey({ offset_minutes: 15 }));
    expect(specKey({ offset_minutes: 15 })).not.toBe(specKey({ all_day_time: "00:15", all_day_days_before: 0 }));
  });

  it("round-trips the editor's text field and ignores what it cannot read", () => {
    const text = specsText([{ offset_minutes: 15 }, { all_day_time: "09:00", all_day_days_before: 1 }]);
    expect(specsFromText(text)).toEqual([{ all_day_time: "09:00", all_day_days_before: 1 }, { offset_minutes: 15 }]);
    expect(specsFromText("not json")).toEqual([]);
    expect(specsFromText('[{"offset_minutes":"x"}, 3]')).toEqual([]);
  });
});

describe("reminderWhen", () => {
  it("shows a timed event in the reader's zone and an all-day event on its date", () => {
    const payload = {
      occurrence_date: "2026-11-10",
      all_day: false,
      start_time: "23:30",
      length_minutes: 60,
      tzid: "Europe/Berlin",
    };
    // 23:30 in Berlin (UTC+1) is 02:30 the next day in Baku (UTC+4).
    expect(reminderWhen(payload, "Asia/Baku")).toEqual({ day: "2026-11-11", start: "02:30", end: "03:30" });
    expect(reminderWhen({ occurrence_date: "2026-12-25", all_day: true }, "Asia/Baku")).toEqual({
      day: "2026-12-25",
      start: null,
      end: null,
    });
    expect(reminderWhen({}, "Asia/Baku")).toBeNull();
  });
});

describe("reminders on cards", () => {
  it("fire from the due time, or from the due date as a whole day, in the zone given", () => {
    expect(cardFireTime({ offset_minutes: 30 }, "2026-11-10", "09:30", "Europe/Berlin")).toBe(
      at("2026-11-10T08:00:00Z"),
    );
    expect(cardFireTime({ offset_minutes: 0 }, "2026-11-10", null, "Europe/Berlin")).toBe(at("2026-11-09T23:00:00Z"));
    expect(cardFireTime({ all_day_time: "09:00", all_day_days_before: 1 }, "2026-11-10", "18:00", "UTC")).toBe(
      at("2026-11-09T09:00:00Z"),
    );
    expect(cardFireTime({ offset_minutes: 30 }, null, null, "UTC")).toBeNull();
  });

  it("tell whether one of the user's reminders of a card is still ahead", () => {
    const rows = [
      { id: "r1", item_id: "c1", offset_minutes: 60, deleted_at: null },
      { id: "r2", item_id: "c1", offset_minutes: 0, deleted_at: "2026-11-01T00:00:00Z" },
    ];
    const card = { id: "c1", due_date: "2026-11-10", due_time: "09:30" };
    expect(cardReminderAhead(rows, card, "UTC", at("2026-11-10T08:30:00Z"))).toBe(true);
    expect(cardReminderAhead(rows, card, "UTC", at("2026-11-10T08:31:00Z"))).toBe(false);
    expect(cardReminderAhead(rows, { ...card, due_date: null }, "UTC", 0)).toBe(false);
  });

  it("read a card's notification as its due day and time in the reader's zone", () => {
    const payload = { due_date: "2026-11-10", due_time: "09:30", tzid: "Europe/Berlin" };
    expect(cardReminderWhen(payload, "Asia/Tokyo")).toEqual({ day: "2026-11-10", start: "17:30", end: null });
    expect(cardReminderWhen({ ...payload, due_time: null }, "Asia/Tokyo")).toEqual({
      day: "2026-11-10",
      start: null,
      end: null,
    });
    expect(cardReminderWhen({}, "UTC")).toBeNull();
  });
});

function at(iso: string): number {
  return Date.parse(iso);
}
