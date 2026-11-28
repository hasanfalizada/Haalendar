// +++===+++ 2026-11-25 09:14 +04 — Hasan Alizada — HAAL-114. Card comments (FR-KAN-05, D-123) through the local store and
// outbox (offline too), written at once with a notification and one undo step: writing one (undone by deleting it),
// changing its text (undone by the text before), deleting it (undone by a restore). Who may do what is checked by the
// server too; the editor only offers what the user may do (commentRights).
import { runWrite } from "@/api/write";
import i18n from "@/i18n";
import { newStep, registerUndo } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

export const COMMENT_MAX = 10_000;

interface CommentRef {
  user: string;
  id: string;
}

interface CommentEdit extends CommentRef {
  before: string;
  after: string;
}

const target = (id: string) => ({ entity_type: "comment" as const, entity_id: id });

const setBody = (user: string, id: string, from: string, to: string) =>
  mutate(user, { ...target(id), op: "update", base: { body: from }, data: { body: to } });

registerUndo<CommentRef>("comment.create", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
});

registerUndo<CommentEdit>("comment.update", {
  undo: ({ user, id, before, after }) => ({ run: () => setBody(user, id, after, before) }),
  redo: ({ user, id, before, after }) => ({ run: () => setBody(user, id, before, after) }),
});

registerUndo<CommentRef>("comment.delete", {
  undo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "restore" }) }),
  redo: ({ user, id }) => ({ run: () => mutate(user, { ...target(id), op: "delete" }) }),
});

/** A comment's text is worth sending: some text, at most COMMENT_MAX characters. */
export function sendable(body: string): boolean {
  return body.trim() !== "" && body.length <= COMMENT_MAX;
}

/** What the user may do with a comment: change it (its author) and delete it (its author or the board's owner). */
export function commentRights(
  comment: Row,
  user: string,
  boardOwner: unknown,
  canWrite: boolean,
): { edit: boolean; remove: boolean } {
  const mine = comment.author_id === user;
  return { edit: canWrite && mine, remove: canWrite && (mine || boardOwner === user) };
}

/** The live comments of a card, oldest first. */
export function commentsOf(rows: readonly Row[], cardId: string): Row[] {
  return rows
    .filter((row) => row.item_id === cardId && !row.deleted_at)
    .sort((a, b) => text(a.created_at).localeCompare(text(b.created_at)) || String(a.id).localeCompare(String(b.id)));
}

/** Writes a comment on a card (`title`: the card's, for the messages). */
export async function createComment(user: string, cardId: string, title: string, body: string): Promise<boolean> {
  const id = uuidv7();
  const values = { title };
  const result = await runWrite({
    name: "comment_create",
    run: () => mutate(user, { ...target(id), op: "create", data: { item_id: cardId, body } }),
    // A repeat would write the comment twice (refused: the id is taken).
    retry: false,
    success: i18n.t("comments.done.create", values),
    undo: () => newStep("comment.create", { key: "undo.labels.commented", values }, { user, id }),
  });
  return result.ok;
}

/** Changes the text of the user's own comment. */
export async function updateComment(user: string, comment: Row, body: string): Promise<boolean> {
  const id = String(comment.id);
  const before = typeof comment.body === "string" ? comment.body : "";
  if (before === body) return true;
  const result = await runWrite({
    name: "comment_update",
    run: () => setBody(user, id, before, body),
    success: i18n.t("comments.done.update"),
    undo: () => newStep("comment.update", { key: "undo.labels.commentEdited" }, { user, id, before, after: body }),
  });
  return result.ok;
}

/** Puts a comment in the trash (soft, its own batch), with Undo. */
export async function deleteComment(user: string, comment: Row): Promise<boolean> {
  const id = String(comment.id);
  const result = await runWrite({
    name: "comment_delete",
    run: () => mutate(user, { ...target(id), op: "delete" }),
    success: i18n.t("comments.done.delete"),
    undo: () => newStep("comment.delete", { key: "undo.labels.commentDeleted" }, { user, id }),
  });
  return result.ok;
}
