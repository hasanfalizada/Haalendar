// +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The command palette in the app: Ctrl+K opens the
// search window with the commands (pressed again it closes it, from the search it turns it into the palette); a
// command goes to a board; the typed words create an event or a note in its editor with that title, or a card on a
// board at once, with Undo.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, noPush, renderApp, stubApi } from "./fake-api";

const USER = me().id;
const CAL = "0199f000-0000-7000-8000-0000000000c1";
const BOARD = "0199f000-0000-7000-8000-0000000000b1";
const COLUMN = "0199f000-0000-7000-8000-0000000000d1";

async function open(path = "/calendar?date=2026-11-24&view=day") {
  window.localStorage.clear();
  const db = await localDb(USER);
  await db.calendars.put({ id: CAL, name: "Work", owner_id: USER, is_default: true, deleted_at: null });
  await db.boards.put({
    id: BOARD,
    owner_id: USER,
    name: "Home",
    position: "U",
    archived_at: null,
    deleted_at: null,
    version: 1,
  });
  await db.boardColumns.put({
    id: COLUMN,
    board_id: BOARD,
    container_kind: "board",
    container_id: BOARD,
    name: "To do",
    position: "M",
    wip_limit: null,
    archived_at: null,
    deleted_at: null,
    version: 1,
  });
  stubApi({ "GET /me": () => json(me()), "POST /sync/push": noPush });
  const { router } = renderApp(path);
  await screen.findByRole("button", { name: /Account menu/ });
  return { user: userEvent.setup(), router, db };
}

const palette = () => screen.findByRole("combobox", { name: "Commands and search" });

const options = (group: string) =>
  within(screen.getByRole("group", { name: group }))
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("the command palette", { timeout: 20_000 }, () => {
  it("opens on Ctrl+K with the commands, goes to a board, and closes on Ctrl+K", async () => {
    const { user, router } = await open();
    await user.keyboard("{Control>}k{/Control}");
    const box = await palette();
    expect(box).toHaveFocus();
    expect(options("Go to")).toEqual(
      expect.arrayContaining([expect.stringContaining("Calendar"), "Today in the calendar", "Board “Home”"]),
    );
    expect(options("Create")).toEqual(["New event", "New note", "New list"]);

    await user.keyboard("{Control>}k{/Control}");
    await waitFor(() => {
      expect(screen.queryByRole("combobox", { name: "Commands and search" })).not.toBeInTheDocument();
    });

    // From the search Ctrl+K turns the window into the palette.
    await user.keyboard("/");
    await screen.findByRole("combobox", { name: "Search" });
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await palette(), "home{Enter}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
    });
  });

  it("creates an event and a note in their editors with the typed title", async () => {
    const { user, router } = await open("/calendar?date=2026-11-24&view=week");
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await palette(), "Dentist");
    await waitFor(() => {
      expect(options("Create")[0]).toBe("Create event “Dentist”");
    });
    await user.keyboard("{Enter}");
    const event = await screen.findByRole("dialog", { name: "New event" });
    expect(within(event).getByLabelText("Title")).toHaveValue("Dentist");
    // The request has left the URL; the day and the view shown stay.
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ date: "2026-11-24", view: "week" });
    });
    await user.click(within(event).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New event" })).not.toBeInTheDocument();
    });

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await palette(), "Groceries");
    await user.click(await screen.findByRole("option", { name: "Create note “Groceries”" }));
    const note = await screen.findByRole("dialog", { name: "New note" });
    expect(within(note).getByLabelText("Title")).toHaveValue("Groceries");
    expect(router.state.location.pathname).toBe("/todo");
  });

  it("adds a card to the first column of a board at once, with Undo", async () => {
    const { user, router, db } = await open();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await palette(), "Paint the door");
    await user.click(await screen.findByRole("option", { name: "Add card “Paint the door” to Home" }));

    const toast = await screen.findByText(/Paint the door/, { selector: "li *" });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/kanban/${BOARD}`);
    });
    const card = (await db.items.toArray()).find((row) => row.title === "Paint the door");
    expect(card).toMatchObject({ kind: "card", container_id: BOARD, column_id: COLUMN });

    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect((await db.items.get(String(card?.id)))?.deleted_at).toBeTruthy();
    });
  });
});
