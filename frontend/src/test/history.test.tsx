// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. History timeline: actors (you / name / system), actions, field
// changes before → after, shortened values, empty state.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditRecord } from "@/api/generated/types.gen";
import { HistoryTimeline } from "@/components/history/HistoryTimeline";
import { displayValue } from "@/lib/audit-format";

import { json, me, renderWithProviders, stubApi } from "./fake-api";

const NOW = new Date("2026-10-16T12:00:00Z");
const ADA = me({ time_zone: "UTC" });

function record(overrides: Partial<AuditRecord>): AuditRecord {
  return {
    id: crypto.randomUUID(),
    occurred_at: "2026-10-16T11:00:00Z",
    actor_id: ADA.id,
    actor_name: "Ada Admin",
    action: "update",
    entity_type: "calendar",
    entity_id: "0199f000-0000-7000-8000-0000000000c1",
    before: null,
    after: null,
    ...overrides,
  };
}

describe("HistoryTimeline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists who did what, newest first, with field changes", async () => {
    stubApi({ "GET /me": () => json(ADA) });
    renderWithProviders(
      <HistoryTimeline
        now={NOW}
        records={[
          record({
            action: "update",
            before: { name: "Home", color: "blue" },
            after: { name: "Family", color: "green" },
          }),
          record({ action: "share", actor_id: "0199f000-0000-7000-8000-000000000009", actor_name: "Bob Builder" }),
          record({
            action: "create",
            actor_id: null,
            actor_name: null,
            after: { name: "Home" },
            occurred_at: "2026-10-01T08:00:00Z",
          }),
        ]}
      />,
    );
    const items = within(await screen.findByRole("list", { name: "History" })).getAllByRole("listitem");
    const entries = items.filter((li) => li.parentElement?.getAttribute("aria-label") === "History");
    expect(entries).toHaveLength(3);
    expect(await within(entries[0] as HTMLElement).findByText("You")).toBeInTheDocument();
    expect(entries[0]).toHaveTextContent("You changed");
    expect(entries[0]).toHaveTextContent("Name: Home → Family");
    expect(entries[0]).toHaveTextContent("Color: blue → green");
    expect(entries[1]).toHaveTextContent("Bob Builder shared it");
    expect(entries[2]).toHaveTextContent("System created it");
    expect(entries[2]).not.toHaveTextContent("Name:"); // a creation lists no field changes
  });

  it("shows an empty state", () => {
    stubApi({ "GET /me": () => json(ADA) });
    renderWithProviders(<HistoryTimeline now={NOW} records={[]} />);
    expect(screen.getByText("No changes recorded yet.")).toBeInTheDocument();
  });
});

describe("displayValue", () => {
  it("shortens long text and marks empty values", () => {
    expect(displayValue(null, "—")).toBe("—");
    expect(displayValue("", "—")).toBe("—");
    expect(displayValue(true, "—")).toBe("true");
    expect(displayValue("x".repeat(100), "—")).toHaveLength(80);
    expect(displayValue("x".repeat(100), "—").endsWith("…")).toBe(true);
  });
});
