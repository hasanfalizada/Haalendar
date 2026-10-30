// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. The board filters (FR-KAN-09, D-96), without React:
// - labels, priorities and due dates (overdue / today / this week / none): any of the chosen ones within a kind; text:
//   in the title, description and checklist items, case ignored; the kinds together (all must match); nothing chosen =
//   every card. Assignees join with HAAL-119.
// - the due date is read in the reader's zone (as the card shows it); "this week" starts on the user's first weekday;
// - kept in the address: `?labels=<id>,<id>&priority=high&due=overdue,today&q=text` (unknown values dropped).
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. Assignees (D-97): "me" or members' ids, any of the chosen; only
//   members' assignments count; `?assignee=me,<id>`.
import type { Priority } from "@/atoms/items/priority";

import { dueState } from "./cards";
import { addDays, todayIn } from "./datetime";
import { weekStartOf } from "./monthGrid";
import { formatPriorityParam, parsePriorityParam } from "./priority";

type Row = Record<string, unknown>;

export const DUE_FILTERS = ["overdue", "today", "week", "none"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export interface BoardFilter {
  labels: string[];
  /** "me" or user ids. */
  assignees: string[];
  priorities: Priority[];
  due: DueFilter[];
  text: string;
}

export const NO_FILTER: BoardFilter = { labels: [], assignees: [], priorities: [], due: [], text: "" };

/** How many kinds are filtered (the phone's "Filters (2)"). */
export function filterCount(filter: BoardFilter): number {
  return [
    filter.labels.length,
    filter.assignees.length,
    filter.priorities.length,
    filter.due.length,
    filter.text.trim().length,
  ].filter((n) => n > 0).length;
}

export interface FilterContext {
  /** Every label-on-item row and checklist item row of the local database. */
  itemLabels: readonly Row[];
  checklistItems: readonly Row[];
  /** Every card assignee row, the board's members (null: not known yet — every row counts) and the user. */
  assignees: readonly Row[];
  members: ReadonlySet<string> | null;
  me: string;
  timeZone: string;
  now: number;
  /** The first day of the week (0 = Sunday … 6 = Saturday). */
  weekStart: number;
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

function dueMatches(card: Row, wanted: readonly DueFilter[], context: FilterContext): boolean {
  const day = textOf(card.due_date);
  const today = todayIn(context.timeZone, new Date(context.now));
  const first = weekStartOf(today, context.weekStart);
  return wanted.some((kind) => {
    if (kind === "none") return day === "";
    if (day === "") return false;
    if (kind === "overdue") return dueState(card, context.timeZone, context.now) === "overdue";
    if (kind === "today") return day === today;
    return day >= first && day <= addDays(first, 6);
  });
}

/** Whether a card is shown under the filter. */
export function cardMatches(card: Row, filter: BoardFilter, context: FilterContext): boolean {
  const id = String(card.id);
  if (filter.labels.length > 0) {
    const on = context.itemLabels.filter((row) => row.item_id === id && !row.deleted_at);
    if (!on.some((row) => filter.labels.includes(String(row.label_id)))) return false;
  }
  if (filter.assignees.length > 0) {
    const wanted = new Set(filter.assignees.map((value) => (value === "me" ? context.me : value)));
    const on = context.assignees.filter(
      (row) =>
        row.item_id === id && !row.deleted_at && (context.members === null || context.members.has(String(row.user_id))),
    );
    if (!on.some((row) => wanted.has(String(row.user_id)))) return false;
  }
  if (filter.priorities.length > 0) {
    const priority = (textOf(card.priority) || "medium") as Priority;
    if (!filter.priorities.includes(priority)) return false;
  }
  if (filter.due.length > 0 && !dueMatches(card, filter.due, context)) return false;
  const needle = filter.text.trim().toLocaleLowerCase();
  if (needle) {
    const items = context.checklistItems.filter((row) => row.item_id === id && !row.deleted_at).map((row) => row.text);
    const haystack = [card.title, card.body, ...items].map(textOf).join("\n").toLocaleLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export interface BoardFilterSearch {
  labels?: string | undefined;
  assignee?: string | undefined;
  priority?: string | undefined;
  due?: string | undefined;
  q?: string | undefined;
}

const ID = /^[0-9a-f-]{36}$/i;

export function parseBoardFilter(search: BoardFilterSearch): BoardFilter {
  const list = (value: unknown) => (typeof value === "string" && value ? value.split(",") : []);
  return {
    labels: list(search.labels).filter((id) => ID.test(id)),
    assignees: list(search.assignee).filter((value) => value === "me" || ID.test(value)),
    priorities: parsePriorityParam(search.priority),
    due: DUE_FILTERS.filter((kind) => list(search.due).includes(kind)),
    text: typeof search.q === "string" ? search.q.slice(0, 200) : "",
  };
}

/** The address form; an empty part is left out. */
export function formatBoardFilter(filter: BoardFilter): BoardFilterSearch {
  return {
    labels: filter.labels.length > 0 ? [...filter.labels].sort().join(",") : undefined,
    // "me" first, then the ids.
    assignee:
      filter.assignees.length > 0
        ? [...filter.assignees].sort((a, b) => (a === "me" ? -1 : b === "me" ? 1 : a.localeCompare(b))).join(",")
        : undefined,
    priority: formatPriorityParam(filter.priorities),
    due: filter.due.length > 0 ? DUE_FILTERS.filter((kind) => filter.due.includes(kind)).join(",") : undefined,
    q: filter.text ? filter.text : undefined,
  };
}
