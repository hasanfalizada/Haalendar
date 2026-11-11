// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Selecting rows: Ctrl/Cmd+click, Shift+click range, plain click
// opens, Ctrl/Cmd+A (not while typing), clicks on a row's own controls, long press and tap-to-toggle on touch.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelection } from "./useSelection";

const IDS = ["a", "b", "c", "d"];

function List({ onOpen }: { onOpen: (id: string) => void }) {
  const selection = useSelection(IDS, { selectAllShortcut: true });
  return (
    <div>
      <input aria-label="Search" />
      <p>selected: {selection.selectedIds.join(",") || "none"}</p>
      <ul>
        {IDS.map((id) => (
          <li
            key={id}
            data-testid={id}
            {...selection.rowProps(id, () => {
              onOpen(id);
            })}
          >
            Row {id}
            <button type="button">Action {id}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("useSelection rows", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toggles with Ctrl/Cmd+click, selects a range with Shift+click, opens on a plain click", async () => {
    const onOpen = vi.fn();
    render(<List onOpen={onOpen} />);
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByTestId("a"));
    await user.keyboard("{/Control}");
    await user.keyboard("{Shift>}");
    await user.click(screen.getByTestId("c"));
    await user.keyboard("{/Shift}");
    expect(screen.getByText("selected: a,b,c")).toBeInTheDocument();
    await user.keyboard("{Meta>}");
    await user.click(screen.getByTestId("b"));
    await user.keyboard("{/Meta}");
    expect(screen.getByText("selected: a,c")).toBeInTheDocument();

    await user.click(screen.getByTestId("d"));
    expect(onOpen).toHaveBeenCalledWith("d");
    expect(screen.getByText("selected: a,c")).toBeInTheDocument();
  });

  it("leaves clicks on a row's own controls alone", async () => {
    const onOpen = vi.fn();
    render(<List onOpen={onOpen} />);
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("button", { name: "Action a" }));
    await user.keyboard("{/Control}");
    expect(screen.getByText("selected: none")).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("selects every row with Ctrl+A, but not while typing", async () => {
    render(<List onOpen={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText("Search"), { code: "KeyA", key: "a", ctrlKey: true });
    expect(screen.getByText("selected: none")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { code: "KeyA", key: "a", ctrlKey: true });
    expect(screen.getByText("selected: a,b,c,d")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByText("selected: none")).toBeInTheDocument();
  });

  it("enters selection mode with a long press and then toggles rows with a tap", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    render(<List onOpen={onOpen} />);
    const row = screen.getByTestId("b");
    fireEvent.pointerDown(row, { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(row, { pointerType: "touch" });
    fireEvent.click(row); // the click that ends the long press
    expect(screen.getByText("selected: b")).toBeInTheDocument();

    const other = screen.getByTestId("d");
    fireEvent.pointerDown(other, { pointerType: "touch" });
    fireEvent.pointerUp(other, { pointerType: "touch" });
    fireEvent.click(other);
    expect(screen.getByText("selected: b,d")).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
