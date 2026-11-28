// +++===+++ 2026-11-27 — Hasan Alizada — HAAL-115 (FR-KAN-06, D-130, option A of the owner). Swimlanes of a board,
// without React: rows of the board grouped by a field the cards already have — priority (high, medium, low), assignee
// (the board's members in their order, then "Unassigned") or label (the board's labels by name, then "No label").
// Nothing new is stored: the grouping is kept in the address (`?lanes=priority|assignee|label`). A card with two
// assignees or two labels is in both lanes. A card moved to another lane takes that lane's value — its priority, or its
// assignee (the one of the lane it left is taken off; to "Unassigned" all of them) —; between label lanes a card is not
// moved (a card in several lanes would leave some of them), and a card added in a lane gets the lane's value.
import { PRIORITIES, type Priority } from "@/atoms/items/priority";
import { uuidv7 } from "@/lib/uuid";

type Row = Record<string, unknown>;

export const LANE_KINDS = ["priority", "assignee", "label"] as const;
export type LaneKind = (typeof LANE_KINDS)[number];

/** A lane: its key (unique on the board), the value its cards have (null: none — "Unassigned", "No label"). */
export interface Lane {
  key: string;
  kind: LaneKind;
  value: string | null;
  /** The member's or the label's name; for priorities the priority. */
  name: string;
  color?: string;
}

export interface LaneContext {
  /** The board's live labels by name and the label-on-item rows. */
  labels: readonly Row[];
  itemLabels: readonly Row[];
  /** The board's members in order (owner first) and every card assignee row. */
  members: readonly { user_id: string; display_name: string }[];
  assignees: readonly Row[];
}

export function parseLanes(value: unknown): LaneKind | null {
  return LANE_KINDS.find((kind) => kind === value) ?? null;
}

export function lanesOf(kind: LaneKind, context: LaneContext): Lane[] {
  if (kind === "priority")
    return PRIORITIES.map((priority) => ({ key: priority, kind, value: priority, name: priority }));
  if (kind === "assignee") {
    return [
      ...context.members.map((member) => ({
        key: member.user_id,
        kind,
        value: member.user_id,
        name: member.display_name,
      })),
      { key: "none", kind, value: null, name: "" },
    ];
  }
  return [
    ...context.labels.map((label) => ({
      key: String(label.id),
      kind,
      value: String(label.id),
      name: String(label.name),
      color: String(label.color),
    })),
    { key: "none", kind, value: null, name: "" },
  ];
}

const live = (rows: readonly Row[], cardId: string) => rows.filter((row) => row.item_id === cardId && !row.deleted_at);

/** The member ids assigned to the card (only members count, as on the card). */
function assigned(card: Row, context: LaneContext): string[] {
  const members = new Set(context.members.map((member) => member.user_id));
  return live(context.assignees, String(card.id))
    .map((row) => String(row.user_id))
    .filter((id) => members.has(id));
}

function labelled(card: Row, context: LaneContext): string[] {
  const labels = new Set(context.labels.map((label) => String(label.id)));
  return live(context.itemLabels, String(card.id))
    .map((row) => String(row.label_id))
    .filter((id) => labels.has(id));
}

/** Whether the card is in the lane. */
export function inLane(card: Row, lane: Lane, context: LaneContext): boolean {
  if (lane.kind === "priority") return (typeof card.priority === "string" ? card.priority : "medium") === lane.value;
  const values = lane.kind === "assignee" ? assigned(card, context) : labelled(card, context);
  return lane.value === null ? values.length === 0 : values.includes(lane.value);
}

/** The item rows with only the cards of the lane (other rows stay, as with the board filters). */
export function laneRows(items: readonly Row[], lane: Lane, context: LaneContext): Row[] {
  return items.filter((item) => item.kind !== "card" || inLane(item, lane, context));
}

/** What a move from one lane to another writes besides the column and the position. */
export interface LaneChange {
  /** Fields of the card (the priority). */
  data: Row;
  assignees: { add: { id: string; user_id: string }[]; remove: string[] };
}

export const NO_LANE_CHANGE: LaneChange = { data: {}, assignees: { add: [], remove: [] } };

/** Whether a card may be moved from one lane to the other (always within a lane; never between label lanes). */
export function canChangeLane(from: Lane, to: Lane): boolean {
  return from.key === to.key || to.kind !== "label";
}

/** The writes that move the card from the lane `from` into `to`; null when it may not go there. */
export function laneChange(card: Row, from: Lane, to: Lane, context: LaneContext): LaneChange | null {
  if (from.key === to.key) return NO_LANE_CHANGE;
  if (!canChangeLane(from, to)) return null;
  if (to.kind === "priority") return { data: { priority: to.value }, assignees: { add: [], remove: [] } };
  const rows = live(context.assignees, String(card.id));
  const members = new Set(context.members.map((member) => member.user_id));
  const memberRows = rows.filter((row) => members.has(String(row.user_id)));
  // To "Unassigned": every member taken off; else the lane left is taken off and the new one put on (once).
  const remove = memberRows
    .filter((row) => to.value === null || row.user_id === from.value)
    .map((row) => String(row.id));
  const add =
    to.value !== null && !memberRows.some((row) => row.user_id === to.value)
      ? [{ id: uuidv7(), user_id: to.value }]
      : [];
  return { data: {}, assignees: { add, remove } };
}

/** What a card added in a lane gets: its priority, or an assignee or a label to put on. */
export interface LaneStart {
  priority?: Priority;
  assignee?: string;
  label?: string;
}

export function laneStart(lane: Lane): LaneStart {
  if (lane.value === null) return {};
  if (lane.kind === "priority") return { priority: lane.value as Priority };
  return lane.kind === "assignee" ? { assignee: lane.value } : { label: lane.value };
}
