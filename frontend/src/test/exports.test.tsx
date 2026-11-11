// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. "Your data": choose modules and images, create an export with the
// password confirmation, follow it from waiting to ready (announced once), download link, one export at a time.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExportRequest } from "@/api/generated/types.gen";

import { type Call, json, me, noContent, problem, renderApp, stubApi } from "./fake-api";

const ID = "0199f000-0000-7000-8000-0000000000f1";

function request(overrides: Partial<ExportRequest> = {}): ExportRequest {
  return {
    id: ID,
    status: "queued",
    modules: ["calendar", "todo"],
    include_images: true,
    requested_at: "2026-10-18T08:00:00Z",
    ...overrides,
  };
}

describe("export section", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an export after the password confirmation and announces when it is ready", async () => {
    let list: ExportRequest[] = [];
    let confirmed = false;
    const calls = stubApi({
      "GET /me": () => json(me()),
      "GET /exports": () => json({ data: list }),
      "POST /exports": (call: Call) => {
        if (!confirmed) return problem(403, "reauth_required");
        list = [request({ modules: (call.body as { modules: ExportRequest["modules"] }).modules })];
        return json(list[0], 202);
      },
      "POST /auth/reauth": () => {
        confirmed = true;
        return noContent();
      },
    });
    const { queryClient } = renderApp("/settings");
    const user = userEvent.setup();
    const section = await screen.findByRole("region", { name: "Your data" });
    await user.click(within(section).getByRole("checkbox", { name: "Kanban" }));
    await user.click(within(section).getByRole("checkbox", { name: "Include images (larger archive)" }));
    await user.click(within(section).getByRole("button", { name: "Create export" }));

    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" });
    await user.type(within(dialog).getByLabelText("Password"), "quiet-mountain-river-42");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/Your export is being prepared/)).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === "POST" && c.path === "/exports");
    expect(posts.at(-1)?.body).toEqual({ modules: ["calendar", "todo"], include_images: true });
    const history = await screen.findByRole("list", { name: "Your exports" });
    expect(within(history).getByText("Waiting")).toBeInTheDocument();
    expect(within(history).getByText("Calendar, To-Do · with images")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Create export" })).toBeDisabled(); // one at a time

    list = [
      request({
        status: "ready",
        size_bytes: 3 * 1024 * 1024,
        expires_at: "2026-10-25T08:00:00Z",
        download_url: `/api/v1/exports/${ID}/download`,
      }),
    ];
    await queryClient.invalidateQueries({ queryKey: ["exports"] });
    expect(await screen.findByText("Your export is ready to download.")).toBeInTheDocument();
    const download = within(history).getByRole("link", { name: "Download" });
    expect(download).toHaveAttribute("href", `/api/v1/exports/${ID}/download`);
    expect(within(history).getByText(/3 MB/)).toBeInTheDocument();
  });

  it("says when an export is already being prepared", async () => {
    stubApi({
      "GET /me": () => json(me()),
      "POST /exports": () => problem(409, "invalid_state"),
    });
    renderApp("/settings");
    const section = await screen.findByRole("region", { name: "Your data" });
    await userEvent.setup().click(within(section).getByRole("button", { name: "Create export" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("An export is already being prepared.");
    });
  });
});
