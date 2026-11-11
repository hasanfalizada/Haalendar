// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-042. Colour picker: brown by default, named colours, arrow keys, the
// chosen colour marked; palette helpers for rows and swatches.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "@/i18n";
import type { Color } from "@/api/generated/types.gen";
import { COLORS, DEFAULT_COLOR, itemColorClasses, swatchClasses } from "@/lib/palette";

import { ColorPicker } from "./color-picker";

function Picker() {
  const [value, setValue] = useState<Color | null>(null);
  return (
    <>
      <ColorPicker name="color" value={value} onChange={setValue} />
      <p>value: {value ?? "none"}</p>
    </>
  );
}

describe("ColorPicker", () => {
  it("offers the 8 named colours with brown chosen by default, by click and arrow keys", async () => {
    render(<Picker />);
    const user = userEvent.setup();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Red",
      "Orange",
      "Yellow",
      "Green",
      "Blue",
      "Purple",
      "Brown",
      "Black",
    ]);
    expect(screen.getByRole("radio", { name: "Brown" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByText("value: blue")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("value: purple")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Color" })).toBeInTheDocument();
  });
});

describe("palette helpers", () => {
  it("keep the legacy order, default to brown and build the tint + bar classes", () => {
    expect(COLORS).toHaveLength(8);
    expect(DEFAULT_COLOR).toBe("brown");
    expect(itemColorClasses(null)).toBe("ev-brown ev-tint ev-bar");
    expect(itemColorClasses("yellow")).toBe("ev-yellow ev-tint ev-bar");
    expect(swatchClasses("red")).toBe("ev-red ev-swatch");
  });
});
