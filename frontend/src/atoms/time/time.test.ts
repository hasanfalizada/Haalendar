// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. The TypeScript time atoms must pass the shared vectors.
import { describe, expect, it } from "vitest";

import eventDaysVectors from "../../../../atoms/time.event_days.v1/vectors.json";
import localVectors from "../../../../atoms/time.local_to_utc.v1/vectors.json";

import { type EventTimes, eventDays } from "./eventDays";
import { localToUtc, UnknownTimeZoneError } from "./localToUtc";

interface LocalCase {
  name: string;
  input: { date: string; time: string; tzid: string };
  output: unknown;
}

interface DaysCase {
  name: string;
  input: { event: EventTimes; viewer_tzid: string };
  output: unknown;
}

describe("time.local_to_utc.v1 (TypeScript)", () => {
  it.each((localVectors as { cases: LocalCase[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(localToUtc(c.input.date, c.input.time, c.input.tzid)).toEqual(c.output);
  });

  it("rejects unknown zones", () => {
    expect(() => localToUtc("2026-01-01", "09:00", "Mars/Olympus_Mons")).toThrow(UnknownTimeZoneError);
  });
});

describe("time.event_days.v1 (TypeScript)", () => {
  it.each((eventDaysVectors as { cases: DaysCase[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(eventDays(c.input.event, c.input.viewer_tzid)).toEqual(c.output);
  });
});
