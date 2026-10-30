// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. Links (D-98) through the local store and outbox (offline too), written
// at once with a notification and one undo step: linking one or more items to an item (undone by removing the links),
// and removing a link (undone by a restore).
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { batchStep, newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

interface LinkRef {
  user: string;
  id: string;
}

const target = (id: string) => ({ entity_type: "link" as const, entity_id: id });

registerUndo<LinkRef>("link.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<LinkRef>("link.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

/** Links `others` to `itemId` (named `title` in the messages). */
export async function createLinks(
  user: string,
  itemId: string,
  title: string,
  others: readonly string[],
): Promise<boolean> {
  if (others.length === 0) return true;
  const ids = others.map(() => uuidv7());
  const values = { title, count: String(others.length) };
  const label = { key: "undo.labels.linked", values };
  const result = await runWrite({
    name: "link_create",
    run: async () => {
      let written: { data: unknown } = { data: true };
      for (const [index, other] of others.entries()) {
        written = await mutate(user, {
          ...target(ids[index] ?? uuidv7()),
          op: "create",
          data: { from_item_id: itemId, to_item_id: other },
        });
      }
      return written;
    },
    // A repeat would link the pair twice (refused).
    retry: false,
    success: i18n.t("links.done.create", { title, count: others.length }),
    undo: () => {
      const steps = ids.map((id) => newStep("link.create", label, { user, id }));
      return steps.length === 1 && steps[0] ? steps[0] : batchStep(label, steps);
    },
  });
  return result.ok;
}

/** Removes a link (`name`: the item at its other end). */
export async function removeLink(user: string, linkId: string, name: string): Promise<boolean> {
  const values = { title: name };
  const result = await runWrite({
    name: "link_delete",
    run: () => mutate(user, { ...target(linkId), op: "delete" }),
    success: i18n.t("links.done.delete", values),
    undo: () => newStep("link.delete", { key: "undo.labels.unlinked", values }, { user, id: linkId }),
  });
  return result.ok;
}
