// +++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. A toast being removed keeps a timer that survives its unmount; one
// that fired after the test file had closed jsdom failed the whole run with "window is not defined". When exactly that
// happens depends on the machine, so this test checks what prevents it: the wait at the end of each file (setup.ts) is
// longer than any timer of sonner that is still running once the toast is unmounted.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { toast, Toaster } from "sonner";
import { expect, test, vi } from "vitest";

import { TOAST_REMOVAL_MS } from "./timing";

test("each test file waits longer than the toast timers that survive an unmount", async () => {
  const running = new Map<unknown, number>();
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const setSpy = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((callback: () => void, delay?: number): ReturnType<typeof setTimeout> => {
      const id = realSetTimeout(callback, delay);
      if (new Error().stack?.includes("sonner")) running.set(id, delay ?? 0);
      return id;
    });
  const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id?: ReturnType<typeof setTimeout>) => {
    running.delete(id);
    realClearTimeout(id);
  }) as typeof clearTimeout);

  render(<Toaster />);
  act(() => {
    toast("Saved");
  });
  const shown = await screen.findByText("Saved");
  act(() => {
    toast.dismiss();
  });
  await waitFor(() => {
    expect(shown.closest("[data-sonner-toast]")).toHaveAttribute("data-removed", "true");
  });
  cleanup();
  const survivors = [...running.values()];
  setSpy.mockRestore();
  clearSpy.mockRestore();

  expect(survivors).not.toEqual([]);
  expect(Math.max(...survivors)).toBeLessThan(TOAST_REMOVAL_MS);
});
