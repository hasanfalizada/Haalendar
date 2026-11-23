// +++===+++ 2026-11-23 10:30 +04 — Hasan Alizada — HAAL-046 (D-120). The filters of the search (FR-X-19, C-14), without
// React: module, dates, calendar, colour, priority and label.
// - Any of the chosen values within a filter, every filter at once (as the board filters, D-96); nothing chosen = no
//   filter.
// - A filter that does not apply to a module leaves the module out: a calendar keeps events only, a label notes and
//   cards only.
// - Dates: an event is kept when one of its days (or of its occurrences) is in the range; a note or a card when its due
//   date is (none: left out). Presets: today, this week (from the user's first weekday), this month, the next 30 days.
// - Labels by name (case and accents ignored): the personal labels of notes and the labels of boards in one list.
import { occurrences } from "@/atoms/calendar/recurrence";
import type { Priority } from "@/atoms/items/priority";

import { addDays, daysBetween, todayIn } from "./datetime";
import { exceptionsOf } from "./dayView";
import { dayToShow } from "./duplicates";
import { weekStartOf } from "./monthGrid";
import { startDayOf } from "./overdue";
import type { Color } from "@/api/generated/types.gen";

import { DEFAULT_COLOR } from "./palette";
import { fold, type SearchModule } from "./search";

type Row = Record<string, unknown>;

export const SEARCH_MODULES: readonly SearchModule[] = ["calendar", "todo", "kanban"];
export const DATE_PRESETS = ["today", "week", "month", "next30"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export interface SearchFilter {
  modules: SearchModule[];
  /** "YYYY-MM-DD" or null; one alone is that day. */
  from: string | null;
  to: string | null;
  calendars: string[];
  colors: Color[];
  priorities: Priority[];
  /** Label names, folded. */
  labels: string[];
}

export const NO_FILTER: SearchFilter = {
  modules: [],
  from: null,
  to: null,
  calendars: [],
  colors: [],
  priorities: [],
  labels: [],
};

export function filterActive(filter: SearchFilter): boolean {
  return (
    filter.modules.length > 0 ||
    filter.from !== null ||
    filter.to !== null ||
    filter.calendars.length > 0 ||
    filter.colors.length > 0 ||
    filter.priorities.length > 0 ||
    filter.labels.length > 0
  );
}

/** The range of a preset around today. */
export function presetRange(preset: DatePreset, today: string, weekStart: number): { from: string; to: string } {
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const from = weekStartOf(today, weekStart);
    return { from, to: addDays(from, 6) };
  }
  if (preset === "month") {
    const from = `${today.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1));
    return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
  }
  return { from: today, to: addDays(today, 29) };
}

export interface FilterContext {
  labels: readonly Row[];
  itemLabels: readonly Row[];
  viewerTz: string;
  today: string;
}

/** What searchItems needs of the filters. */
export interface CompiledFilter {
  active: boolean;
  modules: ReadonlySet<SearchModule>;
  keep: (row: Row, module: SearchModule) => boolean;
  /** The day a result is sorted by when no words were typed; null last. */
  dayOf: (row: Row) => string | null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The due day of a note or a card in the viewer's zone. */
function dueDay(row: Row, viewerTz: string): string | null {
  const date = text(row.due_date);
  if (date) return date.slice(0, 10);
  const at = text(row.due_at);
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : todayIn(viewerTz, new Date(ms));
}

/** One of the event's days (or occurrences) is within [from, to]. */
function eventIn(row: Row, from: string, to: string, viewerTz: string): boolean {
  const start = startDayOf(row, viewerTz);
  if (start === null) return false;
  const rrule = text(row.rrule);
  if (!rrule) {
    const end = text(row.end_date) || start;
    return start <= to && (end < start ? start : end) >= from;
  }
  // Occurrences are asked for at most a year at a time.
  for (let at = from > start ? from : start; at <= to; at = addDays(at, 366)) {
    const last = daysBetween(at, to) > 365 ? addDays(at, 365) : to;
    try {
      const found = occurrences({
        start_date: text(row.start_date),
        rrule,
        exceptions: exceptionsOf(row),
        from: at,
        to: last,
      });
      if (found.length > 0) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function compileFilter(filter: SearchFilter, context: FilterContext): CompiledFilter {
  let modules = new Set<SearchModule>(filter.modules.length > 0 ? filter.modules : SEARCH_MODULES);
  if (filter.calendars.length > 0) modules = new Set([...modules].filter((module) => module === "calendar"));
  if (filter.labels.length > 0) modules = new Set([...modules].filter((module) => module !== "calendar"));
  const from = filter.from ?? filter.to;
  const to = filter.to ?? filter.from;
  const range = from !== null && to !== null ? (from <= to ? [from, to] : [to, from]) : null;

  // The label names of every item with a live label.
  let labelsOf: Map<string, Set<string>> | null = null;
  if (filter.labels.length > 0) {
    const names = new Map(
      context.labels.filter((label) => !label.deleted_at).map((label) => [String(label.id), fold(text(label.name))]),
    );
    labelsOf = new Map();
    for (const link of context.itemLabels) {
      if (link.deleted_at) continue;
      const name = names.get(String(link.label_id));
      if (name === undefined) continue;
      const item = String(link.item_id);
      const set = labelsOf.get(item) ?? new Set<string>();
      set.add(name);
      labelsOf.set(item, set);
    }
  }

  const keep = (row: Row, module: SearchModule): boolean => {
    if (filter.calendars.length > 0 && !filter.calendars.includes(String(row.container_id))) return false;
    if (filter.colors.length > 0 && !filter.colors.includes((text(row.color) || DEFAULT_COLOR) as Color)) return false;
    if (filter.priorities.length > 0 && !filter.priorities.includes((text(row.priority) || "medium") as Priority)) {
      return false;
    }
    if (labelsOf) {
      const names = labelsOf.get(String(row.id));
      if (!names || !filter.labels.some((name) => names.has(name))) return false;
    }
    if (range) {
      const [start = "", end = ""] = range;
      if (module === "calendar") return eventIn(row, start, end, context.viewerTz);
      const due = dueDay(row, context.viewerTz);
      return due !== null && due >= start && due <= end;
    }
    return true;
  };

  const dayOf = (row: Row): string | null =>
    row.kind === "event" ? dayToShow(row, context.today, context.viewerTz) : dueDay(row, context.viewerTz);

  return { active: filterActive(filter), modules, keep, dayOf };
}
