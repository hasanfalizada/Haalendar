// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. Cards on the board (FR-KAN-03, D-92): each column lists its cards with
// labels, due date, checklist progress and attachments; "+ Add card" adds cards at the end and stays open for the next
// one; the card editor saves the changed fields, a move to another column and checklist changes as one step and
// deletes with Undo; a view share sees the card read-only and adds nothing.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-113. Alt+arrows move a card within and between columns (one write of
// column and position each, the focus stays on the card, the move is told and undone); a view share moves nothing.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-117. Overdue and due-soon badges on the cards and in the editor.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { addDays, todayIn } from "@/lib/datetime";
import { comparePositions } from "@/lib/position";
import { localDb } from "@/sync/db";

import { json, me, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const TODO = "0199f000-0000-7000-8000-0000000000d1";
const DONE = "0199f000-0000-7000-8000-0000000000d2";
const PLAN = "0199f000-0000-7000-8000-0000000000e1";
const SHIP = "0199f000-0000-7000-8000-0000000000e2";
const URGENT = "0199f000-0000-7000-8000-0000000000f1";

const column = (id: string, name: string, position: string) => ({
  id,
  board_id: BOARD,
  container_kind: "board",
  container_id: BOARD,
  name,
  position,
  wip_limit: null,
  archived_at: null,
  deleted_at: null,
  version: 1,
});

const card = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "card",
  container_kind: "board",
  container_id: BOARD,
  column_id: TODO,
  title,
  body: "",
  color: "green",
  priority: "medium",
  position: "U",
  due_date: null,
  due_time: null,
  created_at: "2026-10-29T08:00:00Z",
  updated_at: "2026-10-29T08:00:00Z",
  created_by: USER,
  updated_by: USER,
  deleted_at: null,
  version: 2,
  ...extra,
});

async function open(
  board: Record<string, unknown> = {},
  share: Record<string, unknown> | null = null,
  cards: Record<string, unknown>[] = [],
) {
  const db = await localDb(USER);
  await db.boards.put({
    id: BOARD,
    owner_id: USER,
    name: "Revamp",
    position: "U",
    archived_at: null,
    deleted_at: null,
    version: 2,
    ...board,
  });
  await db.boardColumns.bulkPut([column(TODO, "To do", "C"), column(DONE, "Done", "M")]);
  await db.items.bulkPut([
    card(PLAN, "Plan", { position: "C", due_date: "2026-11-10", due_time: "09:30", priority: "high" }),
    card(SHIP, "Ship", { position: "M" }),
    card("gone", "Deleted card", { deleted_at: "2026-10-02T10:00:00Z" }),
  ]);
  await db.items.bulkPut(cards);
  await db.labels.put({
    id: URGENT,
    board_id: BOARD,
    container_kind: "board",
    container_id: BOARD,
    name: "Urgent",
    color: "red",
    deleted_at: null,
  });
  await db.itemLabels.put({
    id: "il1",
    item_id: PLAN,
    label_id: URGENT,
    container_kind: "board",
    container_id: BOARD,
    deleted_at: null,
  });
  await db.checklistItems.bulkPut([
    {
      id: "ci1",
      item_id: PLAN,
      container_kind: "board",
      container_id: BOARD,
      text: "Draft",
      checked: true,
      position: "C",
      deleted_at: null,
    },
    {
      id: "ci2",
      item_id: PLAN,
      container_kind: "board",
      container_id: BOARD,
      text: "Review",
      checked: false,
      position: "M",
      deleted_at: null,
    },
  ]);
  if (share) await db.shares.put(share);
  // Pushes never answer here, so the outbox keeps what the page wrote.
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": () => new Promise<Response>(() => undefined) });
  renderApp(`/kanban/${BOARD}`);
  await screen.findByRole("heading", { name: "Revamp", level: 1 });
  return { user: userEvent.setup(), db };
}

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

const cardTitles = (region: HTMLElement) =>
  within(region)
    .queryAllByRole("button", { name: /^Open / })
    .map((button) => button.getAttribute("aria-label")?.replace(/^Open /, ""));

describe("cards on the board", { timeout: 20_000 }, () => {
  it("lists the cards of each column with labels, due date, checklist progress and priority", async () => {
    await open();
    const todo = await screen.findByRole("region", { name: "To do" });
    await waitFor(() => {
      expect(cardTitles(todo)).toEqual(["Plan", "Ship"]);
    });
    const plan = within(todo).getByRole("button", { name: "Open Plan" });
    expect(within(plan).getByText("Urgent")).toBeInTheDocument();
    expect(within(plan).getByLabelText("Due Nov 10, 09:30")).toBeInTheDocument();
    expect(within(plan).getByLabelText("1 of 2 checklist items done")).toHaveTextContent("1/2");
    expect(within(plan).getByTitle(/High/)).toBeInTheDocument();
    expect(cardTitles(screen.getByRole("region", { name: "Done" }))).toEqual([]);
    expect(screen.queryByText("Deleted card")).not.toBeInTheDocument();
  });

  it("adds cards at the end of a column and keeps the field open for the next one", async () => {
    const { user } = await open();
    const done = await screen.findByRole("region", { name: "Done" });
    await user.click(within(done).getByRole("button", { name: "Add a card to Done" }));
    const field = within(done).getByLabelText("Title of the new card in Done");
    await user.type(field, "  First  {Enter}");
    await screen.findByText("Card added: First");
    await user.type(field, "Second{Enter}");
    await screen.findByText("Card added: Second");
    await waitFor(() => {
      expect(cardTitles(done)).toEqual(["First", "Second"]);
    });
    await user.keyboard("{Escape}");
    expect(within(done).queryByLabelText("Title of the new card in Done")).not.toBeInTheDocument();
    const [first, second] = await outbox();
    expect(first).toMatchObject({
      entity_type: "item",
      op: "create",
      data: { kind: "card", container_kind: "board", container_id: BOARD, column_id: DONE, title: "First" },
    });
    expect(comparePositions(String(first?.data?.position), String(second?.data?.position))).toBe(-1);
    // Not on the server yet: no attachments to load, a hint instead.
    await user.click(within(done).getByRole("button", { name: "Open First" }));
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    expect(within(editor).getByText("Images can be added once the card has reached the server.")).toBeInTheDocument();
  });

  it("saves the changed fields, a move and the checklist in one step, and deletes with Undo", async () => {
    const { user, db } = await open();
    await user.click(await screen.findByRole("button", { name: "Open Plan" }));
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    const title = within(editor).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Plan the release");
    await user.selectOptions(within(editor).getByLabelText("Column"), "Done");
    await user.click(within(editor).getByRole("button", { name: "Clear due date" }));
    expect(within(editor).getByLabelText("Time (optional)")).toBeDisabled();
    await user.click(within(editor).getByRole("button", { name: "Add item" }));
    await user.keyboard("Ship notes");
    await user.click(within(editor).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Plan the release");
    const [update, item] = await outbox();
    expect(item).toMatchObject({
      entity_type: "checklist_item",
      op: "create",
      data: { item_id: PLAN, text: "Ship notes" },
    });
    expect(update).toMatchObject({
      entity_type: "item",
      entity_id: PLAN,
      op: "update",
      base: { title: "Plan", column_id: TODO, due_date: "2026-11-10", due_time: "09:30" },
      data: { title: "Plan the release", column_id: DONE, due_date: null, due_time: null },
    });
    await waitFor(() => {
      expect(cardTitles(screen.getByRole("region", { name: "Done" }))).toEqual(["Plan the release"]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit card" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Open Ship" }));
    const again = await screen.findByRole("dialog", { name: "Edit card" });
    await user.click(within(again).getByRole("button", { name: "Delete" }));
    const toast = await screen.findByText("Deleted Ship");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit card" })).not.toBeInTheDocument();
    });
    expect(cardTitles(screen.getByRole("region", { name: "To do" }))).toEqual([]);
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(SHIP))?.deleted_at).toBeFalsy();
    });
  });

  it("moves a card with Alt+arrows, keeping the focus, telling where it went and undoing it", async () => {
    const { user, db } = await open();
    const todo = await screen.findByRole("region", { name: "To do" });
    const done = screen.getByRole("region", { name: "Done" });
    await waitFor(() => {
      expect(cardTitles(todo)).toEqual(["Plan", "Ship"]);
    });
    const plan = within(todo).getByRole("button", { name: "Open Plan" });
    expect(plan).toHaveAccessibleDescription("Alt with the arrow keys moves the card");
    plan.focus();
    // At the top and in the first column there is nowhere to go.
    await user.keyboard("{Alt>}{ArrowUp}{ArrowLeft}{/Alt}");
    expect(await outbox()).toEqual([]);

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() => {
      expect(cardTitles(todo)).toEqual(["Ship", "Plan"]);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open Plan" }));
    });
    expect(await screen.findByText("Plan moved to To do, position 2 of 2")).toBeInTheDocument();

    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => {
      expect(cardTitles(done)).toEqual(["Plan"]);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(within(done).getByRole("button", { name: "Open Plan" }));
    });
    expect(await screen.findByText("Plan moved to Done, position 1 of 1")).toBeInTheDocument();
    // Both moves wait in the outbox as one update (merged there): from where the card was to where it is.
    const [across, ...rest] = await outbox();
    expect(rest).toEqual([]);
    expect(across).toMatchObject({
      entity_type: "item",
      entity_id: PLAN,
      op: "update",
      base: { column_id: TODO, position: "C" },
      data: { column_id: DONE },
    });
    expect(Object.keys(across?.data ?? {}).sort()).toEqual(["column_id", "position"]);

    const toast = await screen.findAllByText("Moved Plan");
    // The newest notification is on top: the move to Done.
    await user.click(within(toast[0]?.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(PLAN))?.column_id).toBe(TODO);
    });
    await waitFor(() => {
      expect(cardTitles(todo)).toEqual(["Ship", "Plan"]);
    });
  });

  it("marks overdue and due-soon cards with a word and a sign, not the colour alone", async () => {
    const today = todayIn(me().time_zone);
    const { user } = await open({}, null, [
      card(PLAN, "Plan", { position: "C", due_date: addDays(today, -1) }),
      card(SHIP, "Ship", { position: "M", due_date: today }),
      card("later", "Later", { position: "N", due_date: addDays(today, 3) }),
    ]);
    const todo = await screen.findByRole("region", { name: "To do" });
    const plan = await within(todo).findByRole("button", { name: "Open Plan" });
    await waitFor(() => {
      expect(within(plan).getByText("Overdue")).toBeInTheDocument();
    });
    expect(within(plan).getByLabelText(/^Overdue, due /)).toBeInTheDocument();
    const ship = within(todo).getByRole("button", { name: "Open Ship" });
    expect(within(ship).getByText("Due soon")).toBeInTheDocument();
    const later = within(todo).getByRole("button", { name: "Open Later" });
    expect(within(later).queryByText(/Overdue|Due soon/)).not.toBeInTheDocument();
    expect(within(later).getByLabelText(/^Due /)).toBeInTheDocument();

    await user.click(plan);
    const editor = await screen.findByRole("dialog", { name: "Edit card" });
    expect(within(editor).getByText("Overdue")).toBeInTheDocument();
    await user.clear(within(editor).getByLabelText("Due date"));
    await user.type(within(editor).getByLabelText("Due date"), addDays(today, 3));
    expect(within(editor).queryByText("Overdue")).not.toBeInTheDocument();
  });

  it("shows a card read-only to a view share, without adding cards", async () => {
    const { user } = await open(
      { owner_id: "someone-else" },
      {
        id: "s1",
        container_kind: "board",
        container_id: BOARD,
        grantee_id: USER,
        permission: "view",
        revoked_at: null,
      },
    );
    expect(screen.queryByRole("button", { name: /^Add a card/ })).not.toBeInTheDocument();
    const plan = await screen.findByRole("button", { name: "Open Plan" });
    expect(plan).not.toHaveAccessibleDescription();
    plan.focus();
    await user.keyboard("{Alt>}{ArrowDown}{ArrowRight}{/Alt}");
    expect(await outbox()).toEqual([]);
    await user.click(plan);
    const viewer = await screen.findByRole("dialog", { name: "Card" });
    expect(within(viewer).getByLabelText("Title")).toBeDisabled();
    expect(within(viewer).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(within(viewer).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
