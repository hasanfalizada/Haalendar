// +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. A discarded draft stays discarded (D-39, found on the CI runner by
// unsaved.test.tsx): the autosave still waiting when the person discards, or a write under way, must not bring it back;
// what is typed after that is kept again.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { meQuery } from "@/api/session";

import { allowDrafts, loadDraft, wipeDrafts } from "./drafts";
import { DRAFT_DELAY_MS, useDraft } from "./useDraft";

const USER = "0199f000-0000-7000-8000-000000000001";
const SCOPE = "note:1";
const BASE = { title: "Saved" };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function editor() {
  const client = new QueryClient();
  client.setQueryData(meQuery.queryKey, { id: USER } as never);
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ title }) => useDraft({ scope: SCOPE, values: { title }, baseline: BASE }), {
    wrapper,
    initialProps: { title: "Saved" },
  });
}

describe("useDraft", () => {
  afterEach(() => {
    allowDrafts(USER);
  });

  it("the autosave still waiting does not bring a discarded draft back", async () => {
    const { result, rerender } = editor();
    await act(() => pause(50));
    rerender({ title: "Typed" });
    await act(() => pause(DRAFT_DELAY_MS + 100));
    expect((await loadDraft(USER, SCOPE))?.fields).toEqual({ title: "Typed" });
    rerender({ title: "Typed more" }); // the autosave of this waits
    await act(() => result.current.discard());
    await act(() => pause(DRAFT_DELAY_MS + 100));
    expect(await loadDraft(USER, SCOPE)).toBeNull();
  });

  it("a write under way does not bring a discarded draft back", async () => {
    const { result, rerender } = editor();
    await act(() => pause(50));
    rerender({ title: "Typed" });
    await act(async () => {
      await pause(0);
      const writing = result.current.flush();
      await result.current.discard();
      await writing;
    });
    expect(await loadDraft(USER, SCOPE)).toBeNull();
  });

  it("what is typed after a discard is kept again", async () => {
    const { result, rerender } = editor();
    await act(() => pause(50));
    rerender({ title: "Typed" });
    await act(() => result.current.discard());
    rerender({ title: "Typed again" });
    await act(() => pause(DRAFT_DELAY_MS + 100));
    expect((await loadDraft(USER, SCOPE))?.fields).toEqual({ title: "Typed again" });
  });

  // +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The editor stays open while signing out goes on, so its autosave could
  // write the text back after the wipe, and it stayed on the device (found on the CI runner by drafts.test.tsx).
  it("the autosave still waiting does not bring wiped drafts back", async () => {
    const { rerender } = editor();
    await act(() => pause(50));
    rerender({ title: "Typed" });
    await wipeDrafts(USER);
    await act(() => pause(DRAFT_DELAY_MS + 100));
    expect(await loadDraft(USER, SCOPE)).toBeNull();
  });

  it("a write under way does not bring wiped drafts back", async () => {
    const { result, rerender } = editor();
    await act(() => pause(50));
    rerender({ title: "Typed" });
    await act(async () => {
      await pause(0);
      const writing = result.current.flush();
      await wipeDrafts(USER);
      await writing;
    });
    expect(await loadDraft(USER, SCOPE)).toBeNull();
  });
});
