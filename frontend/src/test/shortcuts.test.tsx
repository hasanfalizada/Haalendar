// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. In the app: "?" and the keyboard button open the overlay listing what
// works on the page (the trash adds its list keys, Delete is not listed there), Alt+2 switches module, F6 moves between
// regions, the trash list is keyboard operable (↓, Space, Enter restores).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrashEntry } from "@/api/generated/types.gen";

import { json, me, renderApp, stubApi } from "./fake-api";

const ADA = me();

function entry(n: number): TrashEntry {
  return {
    type: "calendar",
    id: `0199f000-0000-7000-8000-00000000000${String(n)}`,
    title: `Calendar ${String(n)}`,
    deleted_at: new Date(Date.now() - n * 60_000).toISOString(),
    deleted_by: ADA.id,
    deleted_by_name: "Ada Admin",
    delete_batch_id: `0199f000-0000-7000-8000-0000000000b${String(n)}`,
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    contents: {},
  };
}

describe("keyboard in the app", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the shortcuts of the current page", async () => {
    stubApi({ "GET /me": () => json(ADA), "GET /trash": () => json({ data: [entry(1)], next_cursor: null }) });
    const { router } = renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar" });
    fireEvent.keyDown(document.body, { code: "Slash", key: "?", shiftKey: true });
    let dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Go to To-Do")).toBeInTheDocument();
    expect(within(dialog).getByText("Undo")).toBeInTheDocument();
    expect(within(dialog).getByText("Next area of the page")).toBeInTheDocument();
    expect(within(dialog).queryByText("Previous / next item")).not.toBeInTheDocument();
    await userEvent.setup().keyboard("{Escape}");

    await router.navigate({ to: "/trash" });
    await screen.findByText("Calendar 1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Previous / next item")).toBeInTheDocument();
    expect(within(dialog).getByText("Restore the entry")).toBeInTheDocument();
    expect(within(dialog).getByText("Select all shown")).toBeInTheDocument();
    expect(within(dialog).queryByText("Delete the selection (asks first)")).not.toBeInTheDocument();
  });

  it("switches modules with Alt+digit and moves between regions with F6", async () => {
    stubApi({ "GET /me": () => json(ADA) });
    const { router } = renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar" });
    fireEvent.keyDown(document.body, { code: "Digit2", key: "2", altKey: true });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/todo");
    });

    const main = document.querySelector("main") as HTMLElement;
    const nav = document.querySelector('[data-region="navigation"]') as HTMLElement;
    // jsdom has no layout: report every region as visible.
    for (const el of [main, nav, document.querySelector('[data-region="header"]') as HTMLElement]) {
      el.getClientRects = () => [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
    }
    main.focus();
    fireEvent.keyDown(main, { code: "F6", key: "F6" });
    expect(nav).toHaveFocus();
    fireEvent.keyDown(nav, { code: "F6", key: "F6", shiftKey: true });
    expect(main).toHaveFocus();
  });

  it("restores a trash entry with the keyboard", async () => {
    let entries = [entry(1), entry(2)];
    const calls = stubApi({
      "GET /me": () => json(ADA),
      "GET /trash": () => json({ data: entries, next_cursor: null }),
      "POST /trash/restore": () => {
        entries = entries.slice(0, 1);
        return json({ restored: 1, rows: 1, failed: [] });
      },
    });
    renderApp("/trash");
    const first = (await screen.findByText("Calendar 1")).closest("li") as HTMLElement;
    first.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowDown} ");
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("1 entry restored.")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/trash/restore")?.body).toEqual({
      entries: [{ type: "calendar", id: entry(2).id }],
    });
  });
});
