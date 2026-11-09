// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Local drafts store: per user and editor, survives re-opening the
// database, removed on discard and on sign-out (only that user's), never stores secret fields.
import { describe, expect, it } from "vitest";

import { allowDrafts, countDrafts, discardDraft, loadDraft, saveDraft, wipeDrafts } from "./drafts";

const ADA = "user-ada";
const BOB = "user-bob";

describe("drafts", () => {
  it("keeps a draft per user and editor until it is discarded", async () => {
    expect(await saveDraft(ADA, "note:1", { title: "Shopping", body: "Two hours of text" })).toBe(true);
    await saveDraft(BOB, "note:1", { title: "Bob's" });

    const draft = await loadDraft(ADA, "note:1");
    expect(draft?.fields).toEqual({ title: "Shopping", body: "Two hours of text" });
    expect(Number.isNaN(Date.parse(draft?.saved_at ?? ""))).toBe(false);
    expect((await loadDraft(BOB, "note:1"))?.fields).toEqual({ title: "Bob's" });
    expect(await loadDraft(ADA, "note:2")).toBeNull();

    await discardDraft(ADA, "note:1");
    expect(await loadDraft(ADA, "note:1")).toBeNull();
    expect(await loadDraft(BOB, "note:1")).not.toBeNull();
  });

  it("deletes only the signed-out user's drafts", async () => {
    await saveDraft(ADA, "a", { title: "1" });
    await saveDraft(ADA, "b", { title: "2" });
    await saveDraft(BOB, "a", { title: "3" });
    expect(await countDrafts(ADA)).toBe(2);

    await wipeDrafts(ADA);
    expect(await countDrafts(ADA)).toBe(0);
    expect(await countDrafts(BOB)).toBe(1);
    allowDrafts(ADA);
  });

  // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. Nothing is written back after a wipe, until a new session.
  it("writes nothing for a wiped user until a new session", async () => {
    await wipeDrafts(ADA);
    expect(await saveDraft(ADA, "a", { title: "Too late" })).toBe(false);
    expect(await saveDraft(BOB, "a", { title: "Another user" })).toBe(true);
    expect(await countDrafts(ADA)).toBe(0);

    allowDrafts(ADA);
    expect(await saveDraft(ADA, "a", { title: "New session" })).toBe(true);
    expect(await countDrafts(ADA)).toBe(1);
  });

  it("refuses fields that may hold secrets", async () => {
    expect(await saveDraft(ADA, "security", { new_password: "correct horse battery staple" })).toBe(false);
    expect(await saveDraft(ADA, "security", { totp_code: "123456" })).toBe(false);
    expect(await loadDraft(ADA, "security")).toBeNull();
    // A name merely containing such letters is fine.
    expect(await saveDraft(ADA, "event:1", { description: "Postcode 1000", location: "Baku" })).toBe(true);
  });
});
