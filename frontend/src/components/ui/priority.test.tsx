// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. Priority UI: badge with text (icon-only keeps a screen-reader
// label, lists hide medium), radio picker, multi-level filter, the address parameter.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "@/i18n";
import type { Priority } from "@/atoms/items/priority";
import { formatPriorityParam, parsePriorityParam } from "@/lib/priority";

import { PriorityBadge, PriorityFilter, PrioritySelect } from "./priority";

describe("PriorityBadge", () => {
  it("shows the level as text, icon-only with a label for screen readers, nothing for medium in lists", () => {
    const { rerender, container } = render(<PriorityBadge priority="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    rerender(<PriorityBadge priority="low" compact />);
    expect(screen.getByText("Priority: Low")).toHaveClass("sr-only");
    rerender(<PriorityBadge priority={null} />);
    expect(screen.getByText("Medium")).toBeInTheDocument(); // a missing priority is medium
    rerender(<PriorityBadge priority="medium" hideDefault />);
    expect(container).toBeEmptyDOMElement();
  });
});

function Picker() {
  const [value, setValue] = useState<Priority | null>(null);
  return (
    <>
      <PrioritySelect name="priority" value={value} onChange={setValue} />
      <p>value: {value ?? "none"}</p>
    </>
  );
}

describe("PrioritySelect", () => {
  it("starts at medium and changes with a click or the arrow keys", async () => {
    render(<Picker />);
    const user = userEvent.setup();
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "High" }));
    expect(screen.getByText("value: high")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("value: medium")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Priority" })).toBeInTheDocument();
  });
});

function Filter() {
  const [value, setValue] = useState<Priority[]>([]);
  return (
    <>
      <PriorityFilter value={value} onChange={setValue} />
      <p>filter: {value.join(",") || "all"}</p>
    </>
  );
}

describe("PriorityFilter", () => {
  it("toggles several levels and clears with All", async () => {
    render(<Filter />);
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "High" }));
    expect(screen.getByText("filter: high,low")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Low" }));
    expect(screen.getByText("filter: high")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("filter: all")).toBeInTheDocument();
  });
});

describe("priority address parameter", () => {
  it("reads known levels in order and leaves an empty filter out", () => {
    expect(parsePriorityParam("low,urgent,high")).toEqual(["high", "low"]);
    expect(parsePriorityParam(undefined)).toEqual([]);
    expect(formatPriorityParam(["low", "high"])).toBe("high,low");
    expect(formatPriorityParam([])).toBeUndefined();
  });
});
