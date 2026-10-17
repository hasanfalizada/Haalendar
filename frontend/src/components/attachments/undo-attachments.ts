// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Undo / redo for attachments: adding is undone by a soft delete,
// deleting by a restore from the trash (the binary is never removed, so both directions are lossless). A restore that
// finds nothing to restore reports not_found, so the undo step is dropped as stale. Registered at start-up (App.tsx).
import { deleteAttachment, restoreFromTrash } from "@/api/generated/sdk.gen";
import type { Problem } from "@/api/generated/types.gen";
import { registerUndo } from "@/lib/undo";

interface AttachmentRef {
  id: string;
}

function remove(ref: AttachmentRef) {
  return { run: () => deleteAttachment({ path: { id: ref.id } }) };
}

function restore(ref: AttachmentRef) {
  return {
    run: async () => {
      const result = await restoreFromTrash({ body: { entries: [{ type: "attachment", id: ref.id }] } });
      if (result.data && result.data.restored === 0) {
        const problem: Problem = { type: "about:blank", title: "Not found", status: 404, code: "not_found" };
        return { error: problem, response: result.response };
      }
      return result;
    },
  };
}

registerUndo<AttachmentRef>("attachment.create", { undo: remove, redo: restore });
registerUndo<AttachmentRef>("attachment.delete", { undo: restore, redo: remove });
