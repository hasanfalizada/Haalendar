// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Repeat rules in the editor (FR-CAL-30, D-80): RRULE written in one
// canonical form and read back, presets that depend on the start date, what keeps a rule from fitting its start, the
// readable text, how a whole series moves, and the count of a series opened at a later start.
import { describe, expect, it } from "vitest";

import { checkRule } from "@/atoms/calendar/recurrence";
import { eventData, formFromRow, validate } from "@/lib/eventForm";

import {
  datesBefore,
  describeRrule,
  describeSpec,
  monthlyModes,
  plainSpec,
  presetOf,
  presetsFor,
  rruleOf,
  ruleProblem,
  shiftedRule,
  specFromRrule,
  specFromText,
  specText,
} from "./repeatRule";

const TUESDAY = "2026-11-10"; // the second Tuesday of November

describe("rules", () => {
  it("written canonically for the start and read back", () => {
    expect(rruleOf(plainSpec("weekly"), TUESDAY)).toBe("FREQ=WEEKLY");
    expect(rruleOf({ ...plainSpec("weekly"), weekdays: [1] }, TUESDAY)).toBe("FREQ=WEEKLY"); // only the start's day
    const custom = { ...plainSpec("weekly"), interval: 2, weekdays: [1, 3], end: "count" as const, count: 6 };
    expect(rruleOf(custom, TUESDAY)).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6");
    expect(rruleOf(plainSpec("monthly", "weekday"), TUESDAY)).toBe("FREQ=MONTHLY;BYDAY=2TU");
    expect(rruleOf(plainSpec("monthly", "lastWeekday"), "2026-11-24")).toBe("FREQ=MONTHLY;BYDAY=-1TU");
    expect(rruleOf(plainSpec("monthly", "lastDay"), "2026-11-30")).toBe("FREQ=MONTHLY;BYMONTHDAY=-1");
    const until = { ...plainSpec("daily"), end: "until" as const, until: "2026-12-31" };
    expect(rruleOf(until, TUESDAY)).toBe("FREQ=DAILY;UNTIL=20261231");
    expect(rruleOf(null, TUESDAY)).toBeNull();

    for (const rule of [
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=6",
      "FREQ=MONTHLY;BYDAY=2TU",
      "FREQ=DAILY;UNTIL=20261231",
      "FREQ=YEARLY;INTERVAL=3",
    ]) {
      expect(rruleOf(specFromRrule(rule, TUESDAY), TUESDAY)).toBe(rule);
      checkRule(TUESDAY, rule); // every rule the editor writes fits its start
    }
    expect(specFromRrule("FREQ=HOURLY", TUESDAY)).toBeNull();
  });

  it("the form text, also the earlier editor's values", () => {
    const spec = { ...plainSpec("monthly", "weekday"), interval: 3 };
    expect(specFromText(specText(spec))).toEqual(spec);
    expect(specFromText("weekly")).toEqual(plainSpec("weekly"));
    expect(specFromText("none")).toBeNull();
    expect(specText(null)).toBe("none");
  });

  it("presets follow the start date", () => {
    expect(presetsFor(TUESDAY)).toEqual(["none", "daily", "weekly", "monthly:day", "monthly:weekday", "yearly"]);
    expect(monthlyModes("2026-11-30")).toEqual(["day", "lastWeekday", "lastDay"]); // the fifth Monday, the last day
    expect(monthlyModes("2026-11-24")).toEqual(["day", "weekday", "lastWeekday"]); // fourth and last Tuesday
    expect(presetOf(plainSpec("monthly", "lastDay"), "2026-11-30")).toBe("monthly:lastDay");
    expect(presetOf({ ...plainSpec("daily"), interval: 2 }, TUESDAY)).toBe("custom");
    expect(presetOf({ ...plainSpec("weekly"), weekdays: [1, 3] }, TUESDAY)).toBe("custom");
    expect(presetOf(null, TUESDAY)).toBe("none");
  });

  it("problems: limits, an end before the start, a start the rule does not fit", () => {
    expect(ruleProblem({ ...plainSpec("daily"), interval: 0 }, TUESDAY)).toBe("interval");
    expect(ruleProblem({ ...plainSpec("daily"), interval: Number.NaN }, TUESDAY)).toBe("interval");
    expect(ruleProblem({ ...plainSpec("daily"), end: "count", count: 1000 }, TUESDAY)).toBe("count");
    expect(ruleProblem({ ...plainSpec("daily"), end: "until", until: "2026-11-09" }, TUESDAY)).toBe("until");
    expect(ruleProblem({ ...plainSpec("weekly"), weekdays: [0, 2] }, TUESDAY)).toBe("startNotInRule");
    expect(ruleProblem(plainSpec("monthly", "lastDay"), TUESDAY)).toBe("startNotInRule");
    expect(ruleProblem({ ...plainSpec("weekly"), weekdays: [1, 3] }, TUESDAY)).toBeNull();

    const form = {
      ...formFromRow({ start_date: TUESDAY, end_date: TUESDAY }),
      repeat: specText(plainSpec("monthly", "lastDay")),
    };
    expect(validate(form)).toEqual({ repeat: "startNotInRule" });
    expect(eventData({ ...form, repeat: specText(plainSpec("monthly", "weekday")) }).rrule).toBe(
      "FREQ=MONTHLY;BYDAY=2TU",
    );
  });

  it("reads as text", () => {
    expect(describeRrule("FREQ=DAILY", TUESDAY, "en")).toBe("Every day");
    expect(describeRrule("FREQ=DAILY;INTERVAL=3", TUESDAY, "en")).toBe("Every 3 days");
    expect(describeRrule("FREQ=WEEKLY", TUESDAY, "en")).toBe("Every week on Tuesday");
    expect(describeRrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,TH;UNTIL=20261231", TUESDAY, "en")).toBe(
      "Every 2 weeks on Mon, Tue, and Thu, until Dec 31, 2026",
    );
    expect(describeRrule("FREQ=MONTHLY", TUESDAY, "en")).toBe("Every month on day 10");
    expect(describeRrule("FREQ=MONTHLY;BYDAY=2TU;COUNT=6", TUESDAY, "en")).toBe(
      "Every month on the second Tuesday, 6 times",
    );
    expect(describeRrule("FREQ=MONTHLY;BYDAY=-1MO", "2026-11-30", "en")).toBe("Every month on the last Monday");
    expect(describeRrule("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1", "2026-11-30", "en")).toBe(
      "Every 2 months on the last day",
    );
    expect(describeRrule("FREQ=YEARLY;COUNT=1", TUESDAY, "en")).toBe("Every year on November 10, once");
    expect(describeSpec(plainSpec("yearly"), TUESDAY, "en")).toBe("Every year on November 10");
    expect(describeRrule(null, TUESDAY, "en")).toBeNull();
  });
});

describe("a whole series", () => {
  it("moves to another day only when its rule takes the days from the start; the end date moves along", () => {
    expect(shiftedRule("FREQ=WEEKLY", 2)).toBe("FREQ=WEEKLY");
    expect(shiftedRule("FREQ=DAILY;INTERVAL=2;UNTIL=20261231", 3)).toBe("FREQ=DAILY;INTERVAL=2;UNTIL=20270103");
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=MO,WE", 1)).toBeNull();
    expect(shiftedRule("FREQ=WEEKLY;BYDAY=MO,WE", 0)).toBe("FREQ=WEEKLY;BYDAY=MO,WE"); // other times, same day
    expect(shiftedRule("FREQ=MONTHLY;BYDAY=2TU", 7)).toBeNull();
    expect(shiftedRule("FREQ=MONTHLY;BYMONTHDAY=-1", -1)).toBeNull();
  });

  it("opened at a later start, a counted series keeps its dates", () => {
    // Ten Tuesdays from 3 November; the first two are excluded, so the editor opens on the 17th with eight left.
    const row = {
      start_date: "2026-11-03",
      end_date: "2026-11-03",
      rrule: "FREQ=WEEKLY;COUNT=10",
      exceptions: ["2026-11-03", "2026-11-10"],
    };
    expect(datesBefore("2026-11-03", "FREQ=WEEKLY;COUNT=10", "2026-11-17")).toBe(2);
    const form = formFromRow(row);
    expect(form.start_date).toBe("2026-11-17");
    expect(eventData(form).rrule).toBe("FREQ=WEEKLY;COUNT=8");
  });
});
