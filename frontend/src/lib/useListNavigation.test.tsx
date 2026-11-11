// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. List keyboard navigation: one Tab stop, ↑/↓/Home/End, Shift+↓
// extends the selection, Space selects, Enter and E open, Delete asks first (focus on "Delete", so Delete → Enter) and
// takes the selection or the focused row; a row's own button keeps Enter.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { renderWithProviders } from "@/test/fake-api";

import { useListNavigation } from "./useListNavigation";
import { useSelection } from "./useSelection";

const IDS = ["a", "b", "c", "d"];

function List({ onOpen, onDeleted }: { onOpen: (id: string) => void; onDeleted: (ids: string[]) => void }) {
  const selection = useSelection(IDS);
  const [asking, setAsking] = useState<string[] | null>(null);
  const navigation = useListNavigation(IDS, selection, { onOpen, onDelete: setAsking });
  return (
    <>
      <button type="button">before</button>
      <p>selected: {selection.selectedIds.join(",") || "none"}</p>
      <ul aria-label="Items" {...navigation.listProps}>
        {IDS.map((id) => (
          <li key={id} {...navigation.itemProps(id)}>
            Item {id}
            <button
              type="button"
              onClick={() => {
                onOpen(`button-${id}`);
              }}
            >
              Action {id}
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={asking !== null}
        title="Delete?"
        body={`${String(asking?.length ?? 0)} items`}
        confirmLabel="Delete"
        danger
        focusConfirm
        onConfirm={() => {
          onDeleted(asking ?? []);
          setAsking(null);
          return Promise.resolve();
        }}
        onClose={() => {
          setAsking(null);
        }}
      />
    </>
  );
}

function row(id: string) {
  return screen.getByText(`Item ${id}`).closest("li") as HTMLElement;
}

describe("useListNavigation", () => {
  it("moves the focus with the arrows, Home and End behind a single Tab stop", async () => {
    renderWithProviders(<List onOpen={vi.fn()} onDeleted={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "before" }));
    await user.tab();
    expect(row("a")).toHaveFocus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(row("c")).toHaveFocus();
    await user.keyboard("{End}");
    expect(row("d")).toHaveFocus();
    await user.keyboard("{Home}{ArrowUp}");
    expect(row("a")).toHaveFocus();
    expect(row("b")).toHaveAttribute("tabindex", "-1");
  });

  it("selects with Space and Shift+arrows, opens with Enter and E", async () => {
    const onOpen = vi.fn();
    renderWithProviders(<List onOpen={onOpen} onDeleted={vi.fn()} />);
    const user = userEvent.setup();
    row("a").focus();
    await user.keyboard(" ");
    expect(screen.getByText("selected: a")).toBeInTheDocument();
    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    expect(screen.getByText("selected: a,b,c")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith("c");
    await user.keyboard("{ArrowDown}e");
    expect(onOpen).toHaveBeenLastCalledWith("d");

    within(row("b")).getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith("button-b"); // the row's own button keeps Enter
  });

  it("deletes after a confirmation: Delete, then Enter", async () => {
    const onDeleted = vi.fn();
    renderWithProviders(<List onOpen={vi.fn()} onDeleted={onDeleted} />);
    const user = userEvent.setup();
    row("b").focus();
    await user.keyboard("{Delete}");
    const dialog = await screen.findByRole("dialog", { name: "Delete?" });
    expect(within(dialog).getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onDeleted).toHaveBeenCalledWith(["b"]);

    row("a").focus();
    await user.keyboard(" {ArrowDown} {Delete}");
    expect(await screen.findByText("2 items")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
