// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile in Settings: save with If-Match, conflict reload, avatar
// upload as raw body, client-side limits, removal, avatar fallback.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Avatar } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";

import { json, me, problem, renderApp, stubApi } from "./fake-api";

const AVATAR_URL = "/api/v1/users/0199f000-0000-7000-8000-000000000001/avatar?v=abc";

describe("profile settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves name and time zone with the profile version in If-Match", async () => {
    let current = me({ display_name: "Ada Admin", time_zone: "Europe/Berlin" });
    const calls = stubApi({
      "GET /me": () => json(current),
      "PATCH /me": () => {
        current = { ...current, display_name: "Ada Lovelace", version: 2 };
        return json(current);
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    const name = await screen.findByLabelText("Display name");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    await user.clear(name);
    await user.type(name, "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.headers.get("If-Match")).toBe('"1"');
    expect(patch?.headers.get("Content-Type")).toBe("application/merge-patch+json");
    expect(patch?.body).toEqual({ display_name: "Ada Lovelace" });
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace");
  });

  it("reloads the profile after a version conflict", async () => {
    let current = me({ display_name: "Ada Admin" });
    stubApi({
      "GET /me": () => json(current),
      "PATCH /me": () => {
        current = { ...current, display_name: "Changed Elsewhere", version: 5 };
        return problem(412, "version_conflict");
      },
    });
    renderApp("/settings");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByText(/changed elsewhere\. The latest version is shown/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText("Display name")).toHaveValue("Changed Elsewhere");
    });
  });

  it("uploads the avatar as the raw file and shows it", async () => {
    let current = me();
    const calls = stubApi({
      "GET /me": () => json(current),
      "PUT /me/avatar": () => {
        current = { ...current, avatar_url: AVATAR_URL, version: 2 };
        return json(current);
      },
    });
    renderApp("/settings");
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "me.png", { type: "image/png" });
    await userEvent.setup().upload(await screen.findByLabelText("Upload photo"), file);

    expect(await screen.findByText("Photo updated.")).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.headers.get("Content-Type")).toBe("image/png");
    expect(put?.headers.get("X-CSRF-Token")).toBe("csrf-1");
    expect(put?.body).toBeUndefined(); // binary body, not JSON
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
  });

  it("refuses unsupported or oversized files without a request", async () => {
    const calls = stubApi({ "GET /me": () => json(me()) });
    renderApp("/settings");
    const user = userEvent.setup({ applyAccept: false });
    const input = await screen.findByLabelText("Upload photo");

    await user.upload(input, new File(["GIF89a"], "a.gif", { type: "image/gif" }));
    expect(await screen.findByText("Use a PNG, JPEG or WebP image.")).toBeInTheDocument();
    await user.upload(input, new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));
    expect(await screen.findByText("The image must not exceed 2 MB.")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/me/avatar")).toBe(false);
  });

  it("removes the avatar", async () => {
    let current = me({ avatar_url: AVATAR_URL });
    const calls = stubApi({
      "GET /me": () => json(current),
      "DELETE /me/avatar": () => {
        current = { ...current, avatar_url: null, version: 2 };
        return json(current);
      },
    });
    renderApp("/settings");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Remove photo" }));
    expect(await screen.findByText("Photo removed.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/me/avatar")).toBe(true);
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
  });

  it("links the avatar in the navigation to the profile", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    expect(await screen.findByRole("link", { name: "Profile of Ada Admin" })).toHaveAttribute("href", "/settings");
  });
});

describe("avatar", () => {
  it("shows initials without an image and falls back when the image fails", () => {
    expect(initials("ada lovelace byron")).toBe("AL");
    expect(initials("Ömer")).toBe("Ö");
    expect(initials("   ")).toBe("?");
    const { container, rerender } = render(<Avatar name="Ada Admin" url={null} />);
    expect(container).toHaveTextContent("AA");
    rerender(<Avatar name="Ada Admin" url={AVATAR_URL} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    img?.dispatchEvent(new Event("error"));
    return waitFor(() => {
      expect(container).toHaveTextContent("AA");
    });
  });
});
