// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-031. Relative/absolute time labels and the record timestamps block.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecordTimestamps } from "@/components/ui/record-timestamps";
import { formatInstant, formatRelative } from "@/lib/datetime";

import { json, me, renderWithProviders, stubApi } from "./fake-api";

const NOW = new Date("2026-10-16T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it.each([
    [ago(20_000), "now"],
    [ago(5 * MIN), "5 minutes ago"],
    [ago(3 * HOUR), "3 hours ago"],
    [ago(DAY), "yesterday"],
    [ago(3 * DAY), "3 days ago"],
  ])("%s → %s", (iso, label) => {
    expect(formatRelative(iso, NOW, "UTC", "en")).toBe(label);
  });

  it("switches to date and time after 7 days, in the given zone", () => {
    const old = "2026-10-01T22:30:00Z";
    expect(formatRelative(old, NOW, "Asia/Baku", "en")).toBe(formatInstant(old, "Asia/Baku", "en"));
    expect(formatRelative(old, NOW, "Asia/Baku", "en")).toContain("Oct 2, 2026");
  });
});

describe("RecordTimestamps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows created and updated with exact times and 'by you'", async () => {
    const ada = me({ time_zone: "UTC" });
    stubApi({ "GET /me": () => json(ada) });
    renderWithProviders(
      <RecordTimestamps
        now={NOW}
        record={{ created_at: ago(3 * DAY), updated_at: ago(2 * HOUR), created_by: "someone-else", updated_by: ada.id }}
      />,
    );
    expect(await screen.findByText(/by you/)).toHaveTextContent("2 hours ago by you");
    expect(screen.getByText("Created")).toBeInTheDocument();
    const created = screen.getByText("3 days ago");
    expect(created.tagName).toBe("TIME");
    expect(created).toHaveAttribute("dateTime", ago(3 * DAY));
    expect(created).toHaveAttribute("title", formatInstant(ago(3 * DAY), "UTC", "en"));
    expect(screen.queryByText("Deleted")).not.toBeInTheDocument();
  });

  it("omits 'updated' for an unchanged record and shows the deletion in the trash", () => {
    stubApi({ "GET /me": () => json(me()) });
    renderWithProviders(
      <RecordTimestamps
        now={NOW}
        record={{ created_at: ago(2 * DAY), updated_at: ago(2 * DAY), deleted_at: ago(5 * MIN) }}
      />,
    );
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(screen.getByText("5 minutes ago")).toBeInTheDocument();
  });
});
