// The selection hint of the bulk bar on a touch screen (HAAL-036, UAT finding F13 of HAAL-174).
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkBar } from "@/components/ui/bulk-bar";
import { COARSE_POINTER } from "@/lib/useCoarsePointer";
import { useSelection } from "@/lib/useSelection";

import { renderWithProviders } from "./fake-api";

const DESKTOP_HINT = "Select with the checkboxes, Ctrl+click, Shift+click or Ctrl+A";
const TOUCH_HINT = "Press and hold an item to select it";

function pointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === COARSE_POINTER && coarse,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
}

function Bar({ longPress }: { longPress?: boolean }) {
  const selection = useSelection(["a", "b"]);
  return (
    <BulkBar
      selection={selection}
      total={2}
      actions={["delete"]}
      onAction={() => undefined}
      {...(longPress === undefined ? {} : { longPress })}
    />
  );
}

describe("the selection hint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the keyboard and mouse ways with a mouse", () => {
    pointer(false);
    renderWithProviders(<Bar />);
    expect(screen.getByText(DESKTOP_HINT)).toBeInTheDocument();
  });

  it("names the long press on a touch screen, not Ctrl+click", () => {
    pointer(true);
    renderWithProviders(<Bar />);
    expect(screen.getByText(TOUCH_HINT)).toBeInTheDocument();
    expect(screen.queryByText(DESKTOP_HINT)).not.toBeInTheDocument();
  });

  it("says nothing on a touch screen where a long press does not select (the board)", () => {
    pointer(true);
    renderWithProviders(<Bar longPress={false} />);
    expect(screen.queryByText(TOUCH_HINT)).not.toBeInTheDocument();
    expect(screen.queryByText(DESKTOP_HINT)).not.toBeInTheDocument();
  });
});
