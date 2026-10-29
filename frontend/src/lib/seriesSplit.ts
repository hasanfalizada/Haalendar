// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-093. "This and following" (FR-CAL-31, C-07, D-81): a series is split at
// one of its occurrences, without React. Written with the ordinary sync operations (update, create, exclude), offline
// too, in this order:
// - the series ends the day before: its rule gets UNTIL = that day (a COUNT gives way to it — the same dates);
// - the later part, if any (edit, drag), is a new series starting on the occurrence, with the remaining count;
// - the excluded dates from the occurrence on that fit the new series are excluded there too, so cancelled and
//   replaced occurrences stay away. The series keeps them (nothing is removed; undo needs them back).
// At the first occurrence that is not excluded (the effective start) the whole series is meant: splitsWhole.
import { occurrences } from "@/atoms/calendar/recurrence";
import { addDays } from "@/lib/datetime";
import { effectiveStart, exceptionsOf } from "@/lib/dayView";
import { rruleOf, specFromRrule } from "@/lib/repeatRule";

type Row = Record<string, unknown>;

export interface SplitPlan {
  kind: "split";
  /** The series that now ends before `at`. */
  id: string;
  version: number | null;
  at: string;
  base: { rrule: string };
  data: { rrule: string };
  /** The new series' create data (null: delete this and following). */
  follow: Row | null;
  /** Dates excluded in the new series. */
  exceptions: string[];
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The rule of the series ending the day before `at`. */
export function endedBefore(rrule: string, start: string, at: string): string {
  const spec = specFromRrule(rrule, start);
  const ended = spec ? rruleOf({ ...spec, end: "until", until: addDays(at, -1) }, start) : null;
  if (ended === null) throw new Error("A rule the editor cannot read");
  return ended;
}

/** True when `at` is not after the series' effective start: "this and following" is then the whole series. */
export function splitsWhole(row: Row, at: string): boolean {
  const rrule = text(row.rrule);
  return at <= effectiveStart(text(row.start_date), rrule || null, exceptionsOf(row));
}

function isOccurrence(start: string, rrule: string, day: string): boolean {
  try {
    return occurrences({ start_date: start, rrule, exceptions: [], from: day, to: day }).length === 1;
  } catch {
    return false;
  }
}

/** The writes of a split at `at`; `days`: how far the new series moved from `at` (drag and drop). */
export function planSplit(row: Row, at: string, follow: Row | null, days = 0): SplitPlan {
  const rrule = text(row.rrule);
  const start = text(row.start_date);
  const followStart = text(follow?.start_date);
  const followRule = text(follow?.rrule);
  const exceptions =
    followRule === ""
      ? []
      : exceptionsOf(row)
          .filter((day) => day >= at)
          .map((day) => addDays(day, days))
          .filter((day) => isOccurrence(followStart, followRule, day));
  return {
    kind: "split",
    id: String(row.id),
    version: typeof row.version === "number" ? row.version : null,
    at,
    base: { rrule },
    data: { rrule: endedBefore(rrule, start, at) },
    follow,
    exceptions,
  };
}
