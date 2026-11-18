// +++===+++ 2026-11-18 15:40 +04 — Hasan Alizada — HAAL-103. Grid or list and the manual order of notes (FR-TODO-05,
// D-110): Alt+arrows move a note one place within its section (one position update with undo; the focus stays on it;
// nothing at an edge), with a filter on among the notes shown; a section of one note, the shared notes and notes of
// someone else have no handle; the Grid | List switch saves the setting and goes back when the save fails.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { comparePositions } from "@/lib/position";
import { localDb } from "@/sync/db";

import { type Handler, json, me, noPush, problem, renderApp, settings, stubApi } from "./fake-api";

const USER = me().id;
const BEN = "0199f000-0000-7000-8000-0000000000be";
const IDEAS = "0199f000-0000-7000-8000-0000000000a1";
const BOOKS = "0199f000-0000-7000-8000-0000000000a2";
const SHOPPING = "0199f000-0000-7000-8000-0000000000a3";
const RECIPES = "0199f000-0000-7000-8000-0000000000a4";
const TRIP = "0199f000-0000-7000-8000-0000000000a5";
const SHARE = "0199f000-0000-7000-8000-0000000000s1";

const note = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "note",
  owner_id: USER,
  container_kind: "note",
  container_id: id,
  title,
  body: "",
  color: "brown",
  priority: "medium",
  pinned: false,
  archived_at: null,
  position: "U",
  deleted_at: null,
  version: 3,
  ...extra,
});

async function open(routes: Record<string, Handler> = {}, path = "/todo") {
  const db = await localDb(USER);
  await db.items.bulkPut([
    note(IDEAS, "Ideas", { pinned: true, position: "Z" }),
    note(BOOKS, "Books", { position: "A" }),
    note(SHOPPING, "Shopping", { position: "M", priority: "high" }),
    note(RECIPES, "Recipes", { position: "T", priority: "high" }),
    note(TRIP, "Trip", { owner_id: BEN, position: "B" }),
    note("0199f000-0000-7000-8000-0000000000a6", "Trip plan", { owner_id: BEN, position: "C" }),
  ]);
  for (const id of [TRIP, "0199f000-0000-7000-8000-0000000000a6"]) {
    await db.shares.put({
      id: id === TRIP ? SHARE : "0199f000-0000-7000-8000-0000000000s2",
      container_kind: "note",
      container_id: id,
      grantee_id: USER,
      owner_id: BEN,
      permission: "edit",
      granted_by: BEN,
      created_at: "2026-11-07T08:00:00Z",
      revoked_at: null,
      version: 1,
    });
  }
  // Pushes never answer here, so the outbox keeps what the page wrote.
  const calls = stubApi({ "GET /me": () => json(me()), "POST /sync/push": noPush, ...routes });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), db, calls, router };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const names = (section: string) =>
  within(screen.getByRole("region", { name: section }))
    .getAllByRole("article")
    .map((card) => card.getAttribute("aria-label"));

describe("order and layout of notes", { timeout: 20_000 }, () => {
  it("Alt+arrows move a note one place in its section with undo, keeping the focus", async () => {
    const { user, db } = await open();
    expect(await screen.findByRole("region", { name: "Others" })).toBeInTheDocument();
    expect(names("Others")).toEqual(["Books", "Shopping", "Recipes"]);

    screen.getByRole("button", { name: "Open Books" }).focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await screen.findByText("Moved Books");
    const [moved] = await outbox();
    expect(moved).toMatchObject({ entity_id: BOOKS, op: "update", base: { position: "A" } });
    const position = String(moved?.data?.position);
    expect(comparePositions(position, "M")).toBeGreaterThan(0);
    expect(comparePositions(position, "T")).toBeLessThan(0);
    await waitFor(() => {
      expect(names("Others")).toEqual(["Shopping", "Books", "Recipes"]);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open Books" })).toHaveFocus();
    });
    expect(screen.getByText("Books moved to place 2 of 3")).toBeInTheDocument();

    const toast = await screen.findByText("Moved Books");
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(BOOKS))?.position).toBe("A");
    });
  });

  it("Alt+← and Alt+→ move a note too (not the browser's Back and Forward)", async () => {
    const { user } = await open();
    await screen.findByRole("region", { name: "Others" });
    screen.getByRole("button", { name: "Open Recipes" }).focus();
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => {
      expect(names("Others")).toEqual(["Books", "Recipes", "Shopping"]);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open Recipes" })).toHaveFocus();
    });
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => {
      expect(names("Others")).toEqual(["Books", "Shopping", "Recipes"]);
    });
  });

  it("nothing moves past the edge of a section", async () => {
    const { user } = await open();
    await screen.findByRole("region", { name: "Others" });
    screen.getByRole("button", { name: "Open Books" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    screen.getByRole("button", { name: "Open Recipes" }).focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(await outbox()).toEqual([]);
    expect(names("Others")).toEqual(["Books", "Shopping", "Recipes"]);
  });

  it("a section of one note and the notes shared with the user have no handle", async () => {
    await open();
    await screen.findByRole("region", { name: "Others" });
    expect(screen.getByRole("button", { name: "Drag Books to another place" })).toBeInTheDocument();
    // Pinned holds Ideas alone.
    expect(screen.queryByRole("button", { name: "Drag Ideas to another place" })).not.toBeInTheDocument();
    expect(names("Shared with me")).toEqual(["Trip", "Trip plan"]);
    expect(screen.queryByRole("button", { name: "Drag Trip to another place" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Trip" })).not.toHaveAttribute("aria-keyshortcuts");
  });

  it("with a filter on, a note moves among the notes shown and the hidden ones keep their places", async () => {
    const { user } = await open({}, "/todo?priority=high");
    await waitFor(() => {
      expect(screen.getAllByRole("article").map((card) => card.getAttribute("aria-label"))).toEqual([
        "Shopping",
        "Recipes",
      ]);
    });
    screen.getByRole("button", { name: "Open Recipes" }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await screen.findByText("Moved Recipes");
    const [moved] = await outbox();
    // Before Shopping and after the hidden Books.
    const position = String(moved?.data?.position);
    expect(comparePositions(position, "A")).toBeGreaterThan(0);
    expect(comparePositions(position, "M")).toBeLessThan(0);
  });

  it("the Grid | List switch saves the setting", async () => {
    let saved: unknown = null;
    const { user } = await open({
      "PATCH /me/settings": (call) => {
        saved = call.body;
        return json(settings({ note_layout: "list", version: 2 }));
      },
    });
    const grid = await screen.findByRole("radio", { name: "Grid" });
    expect(grid).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "List" }));
    await waitFor(() => {
      expect(saved).toEqual({ note_layout: "list" });
    });
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("region", { name: "Others" })).getByRole("list")).toHaveClass("flex-col");
  });

  it("the switch goes back to the grid when the save fails", async () => {
    const { user } = await open({
      "PATCH /me/settings": () => problem(422, "validation_failed"),
    });
    await user.click(await screen.findByRole("radio", { name: "List" }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute("aria-checked", "true");
    });
  });
});
