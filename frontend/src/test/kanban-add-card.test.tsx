// The field that adds cards to a column (HAAL-112, UAT finding F9 of HAAL-174).
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AddCard } from "@/components/kanban/AddCard";

import { renderWithProviders } from "./fake-api";

describe("adding a card", () => {
  it("keeps the field usable while the card is written, so the focus stays in it", async () => {
    const user = userEvent.setup();
    let finish: (ok: boolean) => void = () => undefined;
    const added: string[] = [];
    renderWithProviders(
      <AddCard
        columnName="Done"
        onAdd={(title) =>
          new Promise<boolean>((resolve) => {
            added.push(title);
            finish = resolve;
          })
        }
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add a card to Done" }));
    const field = screen.getByLabelText("Title of the new card in Done");
    await user.keyboard("First{Enter}");
    // A browser moves the focus to the page when the focused field is disabled; read-only keeps it.
    expect(field).not.toBeDisabled();
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAttribute("aria-busy", "true");
    // A second Enter while the first card is still being written adds nothing.
    await user.keyboard("{Enter}");
    expect(added).toEqual(["First"]);
    await act(async () => {
      finish(true);
      await Promise.resolve();
    });
    expect(field).toHaveValue("");
    expect(field).not.toHaveAttribute("readonly");
    expect(field).toHaveFocus();
  });
});
