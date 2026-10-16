// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo history: inverse requests with payload updates, redo, 50-step
// limit, a new action clears redo, one-at-a-time execution, stale steps dropped, failed steps kept, batches undone in
// reverse (and only the rest kept after a failure), per-user history in sessionStorage, Undo from the notification.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Problem } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import { renderWithProviders } from "@/test/fake-api";

import {
  batchStep,
  bindUndoUser,
  clearUndo,
  newStep,
  record,
  redo,
  registerUndo,
  undo,
  UNDO_LIMIT,
  undoState,
} from "./undo";

interface Counter {
  name: string;
  value: number;
  version: number;
}

type Reply = { data?: unknown; error?: unknown; response?: Response };
const server = { log: [] as string[], next: [] as (Reply | Error)[] };

function answer(entry: string, data: unknown): Promise<Reply> {
  server.log.push(entry);
  const scripted = server.next.shift();
  if (scripted instanceof Error) return Promise.reject(scripted);
  return Promise.resolve(scripted ?? { data });
}

function conflict(): Reply {
  const error: Problem = { type: "about:blank", title: "conflict", status: 412, code: "version_conflict" };
  return { error, response: new Response(null, { status: 412 }) };
}

registerUndo<Counter>("test.counter", {
  undo: (p) => ({
    run: () => answer(`undo ${p.name} v${String(p.version)}`, { version: p.version + 1 }),
    next: (data, payload) => ({ ...payload, version: (data as { version: number }).version }),
  }),
  redo: (p) => ({
    run: () => answer(`redo ${p.name} v${String(p.version)}`, { version: p.version + 1 }),
    next: (data, payload) => ({ ...payload, version: (data as { version: number }).version }),
  }),
});

function step(name: string, version = 1) {
  return newStep<Counter>(
    "test.counter",
    { key: "undo.labels.shareRemoved", values: { name } },
    {
      name,
      value: 1,
      version,
    },
  );
}

describe("undo history", () => {
  beforeEach(() => {
    bindUndoUser("user-ada");
    clearUndo();
    server.log = [];
    server.next = [];
  });

  it("undoes and redoes with the payload of the latest answer", async () => {
    renderWithProviders(<div />);
    record(step("a"));
    await undo();
    expect(await screen.findByText("Undone: removing access for a.")).toBeInTheDocument();
    await redo();
    expect(await screen.findByText("Redone: removing access for a.")).toBeInTheDocument();
    await undo();
    expect(server.log).toEqual(["undo a v1", "redo a v2", "undo a v3"]);
  });

  it("keeps at most 50 steps and clears redo on a new action", async () => {
    for (let i = 0; i < UNDO_LIMIT + 5; i += 1) record(step(`s${String(i)}`));
    expect(undoState().depth).toBe(UNDO_LIMIT);
    await undo();
    expect(undoState().canRedo).toBe(true);
    record(step("new"));
    expect(undoState().canRedo).toBe(false);
  });

  it("runs steps one after another", async () => {
    record(step("first"));
    record(step("second"));
    await Promise.all([undo(), undo()]);
    expect(server.log).toEqual(["undo second v1", "undo first v1"]);
  });

  it("drops a step whose record was changed meanwhile", async () => {
    renderWithProviders(<div />);
    record(step("a"));
    server.next = [conflict()];
    await undo();
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot undo removing access for a");
    expect(undoState()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it("keeps a step that failed for lack of connection", async () => {
    renderWithProviders(<div />);
    record(step("a"));
    server.next = [new TypeError("Failed to fetch")];
    await undo();
    expect(await screen.findByRole("alert")).toHaveTextContent("the server cannot be reached");
    expect(undoState().canUndo).toBe(true);
    await undo();
    expect(server.log).toEqual(["undo a v1", "undo a v1"]);
    expect(undoState()).toMatchObject({ canUndo: false, canRedo: true });
  });

  it("undoes a batch in reverse and keeps only the unfinished parts after a failure", async () => {
    record(
      batchStep({ key: "undo.labels.shareRemoved", values: { name: "three" } }, [step("x"), step("y"), step("z")]),
    );
    server.next = [{ data: { version: 2 } }, new TypeError("Failed to fetch")];
    await undo();
    expect(server.log).toEqual(["undo z v1", "undo y v1"]);
    await undo();
    expect(server.log).toEqual(["undo z v1", "undo y v1", "undo y v1", "undo x v1"]);
    await redo();
    expect(server.log.slice(4)).toEqual(["redo x v2", "redo y v2", "redo z v2"]);
  });

  it("says when there is nothing to undo", async () => {
    renderWithProviders(<div />);
    await undo();
    expect(await screen.findByText("Nothing to undo.")).toBeInTheDocument();
  });

  it("belongs to one user and survives in the tab's session storage", () => {
    record(step("a"));
    expect(window.sessionStorage.getItem("haalendar.undo")).toContain('"user":"user-ada"');
    bindUndoUser("user-ada");
    expect(undoState().canUndo).toBe(true);
    bindUndoUser("user-bob");
    expect(undoState().canUndo).toBe(false);
  });

  it("offers Undo in the success notification of an undoable write", async () => {
    renderWithProviders(<div />);
    const onUndo = vi.fn();
    registerUndo<null>("test.once", {
      undo: () => ({
        run: () => {
          onUndo();
          return Promise.resolve({ data: null });
        },
      }),
      redo: () => ({ run: () => Promise.resolve({ data: null }) }),
    });
    await runWrite({
      name: "thing_delete",
      run: () => Promise.resolve({ data: { id: 1 } }),
      success: "Deleted.",
      undo: () => newStep("test.once", { key: "undo.labels.shareRemoved", values: { name: "x" } }, null),
    });
    expect(await screen.findByText("Deleted.")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+Z to undo")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undone: removing access for x.")).toBeInTheDocument();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
