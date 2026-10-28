// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. Move to next day (FR-CAL-20, D-73) from the details card or for a
// selection of the day list: the writes of planMove go through the local store and outbox like every event change
// (offline too), one notification and one undo step for all of them. Each change syncs on its own: when another device
// changed one of the events meanwhile, that one becomes an ordinary sync conflict and the others still move.
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { dayLabel } from "@/lib/dayView";
import { addDays } from "@/lib/datetime";
import { type MovePlan, planMove } from "@/lib/moveNextDay";
import { type UndoStep, batchStep, newStep } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

export interface MoveTarget {
  row: Row;
  /** The date the event is shown on ("YYYY-MM-DD"). */
  occurrence: string;
}

const titleOf = (row: Row) =>
  typeof row.title === "string" && row.title !== "" ? row.title : i18n.t("calendar.day.noTitle");

async function write(user: string, plan: MovePlan, newId: string) {
  if (plan.kind === "shift") {
    return mutate(user, {
      entity_type: "item",
      entity_id: plan.id,
      op: "update",
      ...(plan.version !== null ? { base_version: plan.version } : {}),
      base: plan.base,
      data: plan.data,
    });
  }
  await mutate(user, { entity_type: "item", entity_id: newId, op: "create", data: plan.copy });
  return mutate(user, {
    entity_type: "item",
    entity_id: plan.series,
    op: "exclude",
    data: { occurrence_date: plan.date, override_event_id: newId },
  });
}

function steps(user: string, plan: MovePlan, newId: string, title: string): UndoStep[] {
  if (plan.kind === "shift") {
    return [
      newStep(
        "event.update",
        { key: "undo.labels.eventEdited", values: { title } },
        { user, id: plan.id, before: plan.base, after: plan.data },
      ),
    ];
  }
  const date = dayLabel(plan.date, i18n.language);
  return [
    newStep("event.create", { key: "undo.labels.eventCreated", values: { title } }, { user, id: newId }),
    newStep(
      "event.exclude",
      { key: "undo.labels.occurrenceDeleted", values: { title, date } },
      {
        user,
        id: plan.series,
        date: plan.date,
      },
    ),
  ];
}

/** Moves the events to the day after the date each is shown on; true when it was written. */
export async function moveToNextDay(user: string, targets: MoveTarget[]): Promise<boolean> {
  const first = targets[0];
  if (!first) return false;
  const moves = targets.map(({ row, occurrence }) => ({
    plan: planMove(row, occurrence),
    newId: uuidv7(),
    title: titleOf(row),
  }));
  const title = titleOf(first.row);
  const date = dayLabel(addDays(first.occurrence, 1), i18n.language);
  const count = targets.length;
  const result = await runWrite({
    name: "event_move_next_day",
    run: async () => {
      for (const move of moves) await write(user, move.plan, move.newId);
      return { data: moves.length };
    },
    // A repeat would move the events already written once more.
    retry: false,
    success: count === 1 ? i18n.t("calendar.move.done", { title, date }) : i18n.t("calendar.move.doneMany", { count }),
    undo: () =>
      batchStep(
        count === 1
          ? { key: "undo.labels.eventMoved", values: { title, date } }
          : { key: "undo.labels.eventsMoved", values: { count: String(count) } },
        moves.flatMap((move) => steps(user, move.plan, move.newId, move.title)),
      ),
  });
  return result.ok;
}
