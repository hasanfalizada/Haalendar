// +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F6). Bulk actions on selected events, notes and cards
// (FR-X-07, D-41): delete, colour, priority. Like every content change they go through the local store and outbox
// (offline too), as one action: one notification and one undo step for all of them. Each change syncs on its own, so
// a row changed meanwhile on another device becomes an ordinary sync conflict and the others still apply (as "Move to
// next day", D-73). An occurrence of a repeating event chosen in the day list leaves its series ("only this
// occurrence"); the colour and priority of a series are the series'.
import "@/components/calendar/undo-events";
import "@/components/kanban/cardWrites";
import "@/components/todo/noteWrites";

import type { Color, Priority } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { type UndoStep, batchStep, newStep } from "@/lib/undo";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

export type ItemBulkAction = "delete" | "set_color" | "set_priority";

export interface ItemBulkTarget {
  row: Row;
  /** For an occurrence of a repeating event: the date it is shown on. */
  occurrence?: string;
}

const KINDS = new Set(["event", "note", "card"]);
const target = (id: string) => ({ entity_type: "item" as const, entity_id: id });
const versionOf = (row: Row) => (typeof row.version === "number" ? { base_version: row.version } : {});

interface Write {
  run: () => Promise<unknown>;
  step: UndoStep;
}

function deletion(user: string, { row, occurrence }: ItemBulkTarget): Write {
  const id = String(row.id);
  const kind = String(row.kind);
  const label = { key: "bulk.labels.delete", values: { count: "1" } };
  if (kind === "event" && row.rrule && occurrence) {
    return {
      run: () => mutate(user, { ...target(id), op: "exclude", data: { occurrence_date: occurrence } }),
      step: newStep("event.exclude", label, { user, id, date: occurrence }),
    };
  }
  return {
    run: () => mutate(user, { ...target(id), op: "delete", ...versionOf(row) }),
    step: newStep(`${kind}.delete`, label, { user, id }),
  };
}

function change(user: string, row: Row, field: "color" | "priority", value: string): Write | null {
  const before = row[field] ?? null;
  if (before === value) return null;
  const id = String(row.id);
  const base = { [field]: before };
  const data = { [field]: value };
  return {
    run: () => mutate(user, { ...target(id), op: "update", ...versionOf(row), base, data }),
    step: newStep(
      `${String(row.kind)}.update`,
      { key: `bulk.labels.${field}`, values: { count: "1" } },
      {
        user,
        id,
        before: base,
        after: data,
      },
    ),
  };
}

/** Applies the action to the targets as one action; true when it was written. */
export async function runItemBulk(
  user: string,
  action: ItemBulkAction,
  targets: ItemBulkTarget[],
  value?: Color | Priority,
): Promise<boolean> {
  const chosen = targets.filter(({ row }) => KINDS.has(String(row.kind)));
  // One write per item: a series chosen on several days changes once (deletes: one exclusion per date).
  const seen = new Set<string>();
  const unique = chosen.filter(({ row, occurrence }) => {
    const key = action === "delete" && row.rrule ? `${String(row.id)}:${occurrence ?? ""}` : String(row.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const field = action === "set_color" ? "color" : action === "set_priority" ? "priority" : null;
  const writes =
    field === null
      ? unique.map((entry) => deletion(user, entry))
      : unique.flatMap(({ row }) => change(user, row, field, String(value)) ?? []);
  const count = unique.length;
  if (count === 0) return false;
  const name = action === "delete" ? "delete" : field === "color" ? "color" : "priority";
  const result = await runWrite({
    name: `item_bulk_${name}`,
    run: async () => {
      for (const write of writes) await write.run();
      return { data: count };
    },
    // A repeat would apply the writes already made once more.
    retry: false,
    success: i18n.t(`bulk.done.${name}`, { count }),
    undo: () =>
      writes.length === 0
        ? null
        : batchStep(
            { key: `bulk.labels.${name}`, values: { count: String(count) } },
            writes.map((write) => write.step),
          ),
  });
  return result.ok;
}
