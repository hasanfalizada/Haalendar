// +++===+++ 2026-11-25 17:09 +04 — Hasan Alizada — HAAL-122 (D-125, stage 2). Converting an item to another kind goes
// to the server (POST /items/{id}/convert, needs a connection): one notification and one undo step. Undo converts it
// back with the batch of what was taken and the title and description it had; redo converts it again to the same
// place (the payload follows the new batch). After every request the sync pulls at once, so the views show the item
// in its new place without waiting for the live stream.
import { convertItem } from "@/api/generated/sdk.gen";
import type { ConvertedItem, ItemKind } from "@/api/generated/types.gen";
import { registerUndo } from "@/lib/undo";
import { localRows, syncNow } from "@/sync";

const ARRIVAL_MS = 5_000;

/** Where the item goes: a calendar, a board's column (and its place there) or the notes (its place among them). */
export interface ConvertPlace {
  calendar_id?: string;
  board_id?: string;
  column_id?: string;
  position?: string;
}

export interface ConvertStep {
  id: string;
  from: ItemKind;
  to: ItemKind;
  /** The soft-delete batch of what the conversion took. */
  batch: string;
  /** The title and description before the conversion. */
  title: string;
  body: string | null;
  place: ConvertPlace;
}

/** Converts the item, then asks the sync for its new rows. */
export async function convertNow(id: string, body: Parameters<typeof convertItem>[0]["body"]) {
  const answer = await convertItem({ path: { id }, body });
  if (answer.data) syncNow();
  return answer;
}

registerUndo<ConvertStep>("item.convert", {
  undo: (step) => ({
    run: () => convertNow(step.id, { target_kind: step.from, undo: step.batch, title: step.title, body: step.body }),
  }),
  redo: (step) => ({
    run: () => convertNow(step.id, { target_kind: step.to, ...step.place }),
    next: (data, step) => ({ ...step, batch: (data as ConvertedItem).batch_id }),
  }),
});

/** Waits until the sync has brought the item's row of its new kind (at most `waitMs`). */
export async function arrived(user: string, id: string, kind: ItemKind, waitMs = ARRIVAL_MS): Promise<boolean> {
  const until = Date.now() + waitMs;
  for (;;) {
    const row = (await localRows(user, "item")).find((candidate) => candidate.id === id);
    if (row?.kind === kind) return true;
    if (Date.now() >= until) return false;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
