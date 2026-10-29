// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. Move to next day (FR-CAL-20, D-73) from the details card or for a
// selection of the day list: the writes of planMove go through the local store and outbox like every event change
// (offline too), one notification and one undo step for all of them. Each change syncs on its own: when another device
// changed one of the events meanwhile, that one becomes an ordinary sync conflict and the others still move.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. Drag and drop (D-78) writes through runMoves too; a whole series
// that moves takes its excluded dates along: each old date is included again (no check on the server), the series
// moves, then each new date is excluded (the server checks it is an occurrence of the moved series). The undo step
// keeps that order, so undoing it backwards is valid at every point.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-093. A split of a series ("this and following", D-81): the series' new
// end, the new series, its excluded dates — writePlan and planSteps are shared with the editor and the delete.
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { dayLabel } from "@/lib/dayView";
import { addDays } from "@/lib/datetime";
import type { DragPlan } from "@/lib/eventDrag";
import { type MovePlan, planMove } from "@/lib/moveNextDay";
import type { SplitPlan } from "@/lib/seriesSplit";
import { type UndoLabel, type UndoStep, batchStep, newStep } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;
type Plan = MovePlan | DragPlan | SplitPlan;

export interface MoveTarget {
  row: Row;
  /** The date the event is shown on ("YYYY-MM-DD"). */
  occurrence: string;
}

const titleOf = (row: Row) =>
  typeof row.title === "string" && row.title !== "" ? row.title : i18n.t("calendar.day.noTitle");

const item = (id: string) => ({ entity_type: "item" as const, entity_id: id });

/** Writes a plan; `newId`: the id of the one-off copy or the new series. */
export async function writePlan(user: string, plan: Plan, newId: string) {
  if (plan.kind === "split") {
    const result = await mutate(user, {
      ...item(plan.id),
      op: "update",
      ...(plan.version !== null ? { base_version: plan.version } : {}),
      base: plan.base,
      data: plan.data,
    });
    if (plan.follow) await mutate(user, { ...item(newId), op: "create", data: plan.follow });
    for (const date of plan.exceptions) {
      await mutate(user, { ...item(newId), op: "exclude", data: { occurrence_date: date } });
    }
    return result;
  }
  if (plan.kind === "occurrence") {
    await mutate(user, { ...item(newId), op: "create", data: plan.copy });
    return mutate(user, {
      ...item(plan.series),
      op: "exclude",
      data: { occurrence_date: plan.date, override_event_id: newId },
    });
  }
  const exceptions = plan.kind === "series" ? plan.exceptions : [];
  for (const { from } of exceptions) {
    await mutate(user, { ...item(plan.id), op: "include", data: { occurrence_date: from } });
  }
  const result = await mutate(user, {
    ...item(plan.id),
    op: "update",
    ...(plan.version !== null ? { base_version: plan.version } : {}),
    base: plan.base,
    data: plan.data,
  });
  for (const { to } of exceptions) {
    await mutate(user, { ...item(plan.id), op: "exclude", data: { occurrence_date: to } });
  }
  return result;
}

/** The undo steps of a plan, in the order it was written. */
export function planSteps(user: string, plan: Plan, newId: string, title: string): UndoStep[] {
  if (plan.kind === "split") {
    const label = { key: "undo.labels.eventEdited", values: { title } };
    return [
      newStep("event.update", label, { user, id: plan.id, before: plan.base, after: plan.data }),
      ...(plan.follow
        ? [newStep("event.create", { key: "undo.labels.eventCreated", values: { title } }, { user, id: newId })]
        : []),
      ...plan.exceptions.map((date) => newStep("event.exclude", label, { user, id: newId, date })),
    ];
  }
  if (plan.kind === "occurrence") {
    const date = dayLabel(plan.date, i18n.language);
    return [
      newStep("event.create", { key: "undo.labels.eventCreated", values: { title } }, { user, id: newId }),
      newStep(
        "event.exclude",
        { key: "undo.labels.occurrenceDeleted", values: { title, date } },
        { user, id: plan.series, date: plan.date },
      ),
    ];
  }
  const exceptions = plan.kind === "series" ? plan.exceptions : [];
  const label = { key: "undo.labels.eventEdited", values: { title } };
  return [
    ...exceptions.map(({ from }) => newStep("event.include", label, { user, id: plan.id, date: from })),
    newStep("event.update", label, { user, id: plan.id, before: plan.base, after: plan.data }),
    ...exceptions.map(({ to }) => newStep("event.exclude", label, { user, id: plan.id, date: to })),
  ];
}

export interface Move {
  plan: Plan;
  title: string;
}

/** Writes the moves as one action: one notification, one undo step; true when written. */
export async function runMoves(user: string, moves: Move[], success: string, label: UndoLabel): Promise<boolean> {
  const planned = moves.map((move) => ({ ...move, newId: uuidv7() }));
  const result = await runWrite({
    name: "event_move",
    run: async () => {
      for (const move of planned) await writePlan(user, move.plan, move.newId);
      return { data: planned.length };
    },
    // A repeat would move the events already written once more.
    retry: false,
    success,
    undo: () =>
      batchStep(
        label,
        planned.flatMap((move) => planSteps(user, move.plan, move.newId, move.title)),
      ),
  });
  return result.ok;
}

/** Moves the events to the day after the date each is shown on; true when it was written. */
export async function moveToNextDay(user: string, targets: MoveTarget[]): Promise<boolean> {
  const first = targets[0];
  if (!first) return false;
  const title = titleOf(first.row);
  const date = dayLabel(addDays(first.occurrence, 1), i18n.language);
  const count = targets.length;
  return runMoves(
    user,
    targets.map(({ row, occurrence }) => ({ plan: planMove(row, occurrence), title: titleOf(row) })),
    count === 1 ? i18n.t("calendar.move.done", { title, date }) : i18n.t("calendar.move.doneMany", { count }),
    count === 1
      ? { key: "undo.labels.eventMoved", values: { title, date } }
      : { key: "undo.labels.eventsMoved", values: { count: String(count) } },
  );
}
