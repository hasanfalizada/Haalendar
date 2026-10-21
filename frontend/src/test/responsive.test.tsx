// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Mobile rules (FR-X-17, D-53) that the base components carry, so every
// screen and future module inherits them: 44 px targets unless a mouse is used from 768 px, 16 px text in fields on
// touch (no iOS zoom), larger check boxes, 44 px standalone links; and the coarse-pointer hook. Layout itself (no
// sideways scrolling at 360 px) is checked in a real browser (manual audit now, automated in HAAL-143).
import { act, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { INLINE_LINK, STANDALONE_LINK } from "@/components/ui/link-styles";
import { COARSE_POINTER, useCoarsePointer } from "@/lib/useCoarsePointer";

import styles from "../styles.css?raw";
import { json, renderApp, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

function classesOf(element: Element): string[] {
  return element.className.split(/\s+/);
}

describe("touch targets in the base components", () => {
  it("buttons are 44 px unless a mouse is used from 768 px", () => {
    render(
      <>
        <Button>Save</Button>
        <Button size="icon" aria-label="More" />
      </>,
    );
    expect(classesOf(screen.getByRole("button", { name: "Save" }))).toEqual(
      expect.arrayContaining(["h-11", "pointer-fine:md:h-8"]),
    );
    expect(classesOf(screen.getByRole("button", { name: "More" }))).toEqual(
      expect.arrayContaining(["size-11", "pointer-fine:md:size-10"]),
    );
  });

  it("fields are 44 px with 16 px text (no iOS zoom), compact only with a mouse from 768 px", () => {
    render(
      <>
        <Input aria-label="Name" />
        <Select aria-label="Zone">
          <option>UTC</option>
        </Select>
      </>,
    );
    for (const field of [screen.getByLabelText("Name"), screen.getByLabelText("Zone")]) {
      expect(classesOf(field)).toEqual(
        expect.arrayContaining(["h-11", "text-base", "pointer-fine:md:h-9", "pointer-fine:md:text-[13px]"]),
      );
    }
  });

  it("colour swatches and the dialog close button follow the same rule", () => {
    const { unmount } = render(<ColorPicker name="c" value="red" onChange={() => undefined} />);
    const swatch = screen.getByRole("radio", { name: "Red" }).closest("label");
    expect(classesOf(swatch as Element)).toEqual(expect.arrayContaining(["size-11", "pointer-fine:md:size-8"]));
    unmount();
    render(
      <Dialog open>
        <DialogContent title="Dialog" closeLabel="Close" />
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Dialog" });
    expect(classesOf(within(dialog).getByRole("button", { name: "Close" }))).toEqual(
      expect.arrayContaining(["size-11", "pointer-fine:md:size-10"]),
    );
  });

  it("check boxes and their labels are larger on touch devices", () => {
    const coarse = styles.slice(styles.indexOf("@media (pointer: coarse)"));
    expect(coarse).toContain('input[type="checkbox"]');
    expect(coarse).toContain('label:has(> input[type="checkbox"])');
    expect(coarse).toContain("min-height: 44px");
  });

  it("standalone links are 44 px targets, links in a sentence keep the line", () => {
    expect(STANDALONE_LINK.split(" ")).toEqual(expect.arrayContaining(["min-h-11", "pointer-fine:md:min-h-0"]));
    expect(INLINE_LINK).not.toContain("min-h");
  });

  it("the sign-in page uses the standalone link style", async () => {
    stubApi({ "GET /me": () => json({ code: "session_expired" }, 401) });
    renderApp("/login");
    const forgot = await screen.findByRole("link", { name: "Forgot password?" });
    expect(classesOf(forgot)).toEqual(expect.arrayContaining(["min-h-11"]));
  });
});

describe("useCoarsePointer", () => {
  afterEach(() => {
    stubMatchMedia(false);
  });

  it("follows the main pointer, also when it changes", () => {
    let coarse = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        get matches() {
          return query === COARSE_POINTER && coarse;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      })),
    );
    const { result } = renderHook(() => useCoarsePointer());
    expect(result.current).toBe(true);
    act(() => {
      coarse = false;
      for (const listener of listeners) listener();
    });
    expect(result.current).toBe(false);
  });
});
