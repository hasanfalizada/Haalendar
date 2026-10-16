// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Shell behaviour: default route, module navigation by click and Alt+1/2/3,
// shortcuts ignored while typing, mobile drawer, accessible active state, connection indicator, not-found page.
import { createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { createAppRouter, createQueryClient } from "@/router";

function renderApp(initialPath = "/") {
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [initialPath] }));
  render(<App queryClient={queryClient} router={router} />);
  return { router };
}

function railNav() {
  // Two navigations exist (rail + drawer); the rail is rendered permanently, the drawer only when open.
  return screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ok", version: "0.1.0", data: [], next_cursor: null }), {
            status: 200,
          }),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("redirects / to the calendar and marks it active", async () => {
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/calendar");
    expect(within(railNav()).getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
  });

  it("navigates between the three modules by clicking the rail", async () => {
    const user = userEvent.setup();
    renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar", level: 1 });

    await user.click(within(railNav()).getByRole("link", { name: "Kanban" }));
    expect(await screen.findByRole("heading", { name: "Kanban", level: 1 })).toBeInTheDocument();

    await user.click(within(railNav()).getByRole("link", { name: "To-Do" }));
    expect(await screen.findByRole("heading", { name: "To-Do", level: 1 })).toBeInTheDocument();
    expect(within(railNav()).getByRole("link", { name: "To-Do" })).toHaveAttribute("aria-current", "page");
  });

  it("switches modules with Alt+1/2/3", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar", level: 1 });

    await user.keyboard("{Alt>}3{/Alt}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/kanban");
    });
    await user.keyboard("{Alt>}2{/Alt}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/todo");
    });
    await user.keyboard("{Alt>}1{/Alt}");
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/calendar");
    });
  });

  it("ignores module shortcuts while typing in a field", async () => {
    const { router } = renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar", level: 1 });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3", key: "3", altKey: true, bubbles: true }));
    });
    expect(router.state.location.pathname).toBe("/calendar");
    input.remove();
  });

  it("opens the mobile drawer and navigates from it", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar", level: 1 });

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Haalendar" });
    await user.click(within(drawer).getByRole("link", { name: "Trash" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/trash");
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the connection state from the health probe", async () => {
    renderApp("/calendar");
    const statuses = await screen.findAllByRole("status");
    await waitFor(() => expect(statuses[0]).toHaveTextContent("Connected"));
  });

  it("reports an unreachable server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    renderApp("/calendar");
    const statuses = await screen.findAllByRole("status");
    await waitFor(() => expect(statuses[0]).toHaveTextContent("Server unreachable"), { timeout: 4000 });
  });

  it("renders a not-found page for unknown routes", async () => {
    renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Calendar" })).toBeInTheDocument();
  });
});
