// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Display in the profile's time zone and the device/profile mismatch
// notice (switch updates the profile; keep is remembered on the device).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { browserTimeZone } from "@/components/auth/timezone";
import { canonicalZone, formatInstant } from "@/lib/datetime";

import { json, me, renderApp, stubApi } from "./fake-api";

const DEVICE = canonicalZone(browserTimeZone());
const OTHER = DEVICE === "Asia/Baku" ? "Europe/Berlin" : "Asia/Baku";

describe("time zone display", () => {
  it("formats instants in the given zone, not the device's", () => {
    expect(formatInstant("2026-06-10T21:30:00Z", "Asia/Baku", "en-US", "date")).toBe("Jun 11, 2026");
    expect(formatInstant("2026-06-10T21:30:00Z", "America/Los_Angeles", "en-US", "date")).toBe("Jun 10, 2026");
    expect(canonicalZone("Europe/Kiev")).toBe(canonicalZone("Europe/Kyiv"));
  });
});

describe("time zone mismatch notice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("is not shown when device and profile agree", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    await screen.findByRole("heading", { name: /^Calendar:/, level: 1 });
    expect(screen.queryByText(/This device is set to/)).not.toBeInTheDocument();
  });

  it("switches the profile to the device zone", async () => {
    let current = me({ time_zone: OTHER });
    const calls = stubApi({
      "GET /me": () => json(current),
      "PATCH /me": () => {
        current = { ...current, time_zone: DEVICE, version: 2 };
        return json(current);
      },
    });
    renderApp("/calendar");
    expect(
      await screen.findByText(
        `This device is set to ${DEVICE}, your profile to ${OTHER}. Times are shown in ${OTHER}.`,
      ),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: `Use ${DEVICE}` }));

    await waitFor(() => {
      expect(screen.queryByText(/This device is set to/)).not.toBeInTheDocument();
    });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ time_zone: DEVICE });
    expect(patch?.headers.get("If-Match")).toBe('"1"');
  });

  it("remembers 'keep' for this pair of zones on this device", async () => {
    stubApi({ "GET /me": () => json(me({ time_zone: OTHER })) });
    renderApp("/calendar");
    await userEvent.setup().click(await screen.findByRole("button", { name: `Keep ${OTHER}` }));
    expect(screen.queryByText(/This device is set to/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("haalendar.tzMismatchDismissed")).toBe(`${DEVICE}|${OTHER}`);
  });
});
