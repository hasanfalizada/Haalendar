// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Preferences (FR-ACC-09, FR-CAL-23/27, D-50): save only what changed
// with If-Match, Week A/B validation and preview, theme preview undone when leaving without saving, conflict from
// another device, and times shown in the chosen 12/24-hour format.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Settings } from "@/api/generated/types.gen";
import { formatInstant, todayIn } from "@/lib/datetime";

import { type Call, json, me, problem, renderApp, settings, stubApi } from "./fake-api";

/** The Preferences section once the settings have loaded (the form appears with them). */
async function preferences() {
  const section = await screen.findByRole("region", { name: "Preferences" });
  await within(section).findByRole("button", { name: "Save preferences" });
  return section;
}

function stubSettings(initial: Settings = settings()) {
  let saved = initial;
  const calls = stubApi({
    "GET /me": () => json(me()),
    "GET /me/settings": () => json(saved),
    "PATCH /me/settings": (call: Call) => {
      saved = { ...saved, ...(call.body as Partial<Settings>), version: saved.version + 1 };
      return json(saved);
    },
  });
  return { calls, current: () => saved };
}

describe("preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves only what changed, with the version in If-Match", async () => {
    const { calls } = stubSettings();
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await preferences();
    await user.click(within(section).getByRole("radio", { name: /12-hour/ }));
    await user.selectOptions(within(section).getByLabelText("Week starts on"), "Sunday");
    await user.click(within(section).getByRole("radio", { name: "Blue" }));
    const agenda = within(section).getByLabelText("Agenda shows (days)");
    await user.clear(agenda);
    await user.type(agenda, "14");
    await user.click(within(section).getByRole("button", { name: "Save preferences" }));

    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH" && c.path === "/me/settings");
    expect(patch?.body).toEqual({ week_start: 0, time_format: "12h", default_color: "blue", agenda_days: 14 });
    expect(patch?.headers.get("If-Match")).toBe('"1"');
    expect(within(await preferences()).getByRole("button", { name: "Save preferences" })).toBeDisabled();
  });

  it("checks Week A/B before saving and previews this and next week's label", async () => {
    const { calls } = stubSettings();
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await preferences();
    await user.click(within(section).getByRole("checkbox", { name: /Week A\/B label/ }));
    await user.click(within(section).getByRole("button", { name: "Save preferences" }));
    expect(
      await within(section).findByText("Choose a date in a week that should get the first label"),
    ).toBeInTheDocument();

    const first = within(section).getByLabelText("First label");
    const second = within(section).getByLabelText("Second label");
    await user.clear(first);
    await user.type(first, "Odd");
    await user.clear(second);
    await user.type(second, "odd");
    fireEvent.change(within(section).getByLabelText(/A date in a week labelled/), {
      target: { value: todayIn(me().time_zone) },
    });
    await user.click(within(section).getByRole("button", { name: "Save preferences" }));
    expect(await within(section).findByText("Use two different labels")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    await user.clear(second);
    await user.type(second, "Even");
    expect(within(section).getByRole("status")).toHaveTextContent("This week: Odd · next week: Even");
    await user.click(within(section).getByRole("button", { name: "Save preferences" }));
    expect(await screen.findByText("Preferences saved.")).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({
      week_ab: { enabled: true, anchor: todayIn(me().time_zone), labels: ["Odd", "Even"] },
    });
  });

  it("undoes the theme preview when the user leaves without saving", async () => {
    stubSettings();
    const { router } = renderApp("/settings");
    const user = userEvent.setup();
    const section = await preferences();
    await user.click(within(section).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(screen.getAllByRole("link", { name: "Calendar" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/calendar");
    });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("shows the newer version when the settings were changed on another device", async () => {
    let served = settings();
    stubApi({
      "GET /me": () => json(me()),
      "GET /me/settings": () => json(served),
      "PATCH /me/settings": () => {
        served = settings({ agenda_days: 60, version: 2 });
        return problem(412, "version_conflict", { current: served });
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    const section = await preferences();
    await user.click(within(section).getByRole("radio", { name: /12-hour/ }));
    await user.click(within(section).getByRole("button", { name: "Save preferences" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed on another device");
    await waitFor(() => {
      expect(within(section).getByLabelText("Agenda shows (days)")).toHaveValue(60);
    });
  });

  it("shows times in the chosen 12/24-hour format", async () => {
    const at = "2026-10-18T14:30:00Z";
    expect(formatInstant(at, "UTC", "en", "datetime", "24h")).toContain("14:30");
    expect(formatInstant(at, "UTC", "en", "datetime", "12h")).toContain("2:30 PM");

    stubApi({
      "GET /me": () => json(me({ time_zone: "UTC" })),
      "GET /me/settings": () => json(settings({ time_format: "12h" })),
      "GET /exports": () =>
        json({
          data: [
            {
              id: "0199f000-0000-7000-8000-0000000000f1",
              status: "queued",
              modules: ["calendar"],
              include_images: false,
              requested_at: at,
            },
          ],
        }),
    });
    renderApp("/settings");
    expect(await screen.findByText(/Requested Oct 18, 2026, 2:30 PM/)).toBeInTheDocument();
  });
});
