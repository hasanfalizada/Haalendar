// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Attachments: thumbnails and preview (←/→, download), upload by
// picker with the raw body, file name header and a UUIDv7, local refusal of non-images, pasted screenshots, dropped
// files, delete with Undo, read-only view.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Attachment } from "@/api/generated/types.gen";
import { imageTypeOf } from "@/lib/images";
import { uuidv7 } from "@/lib/uuid";
import { type Call, json, renderWithProviders, stubApi } from "@/test/fake-api";

import { Attachments } from "./Attachments";

const ITEM = "0199f000-0000-7000-8000-0000000000e1";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

function attachment(n: number, overrides: Partial<Attachment> = {}): Attachment {
  const id = `0199f000-0000-7000-8000-0000000000a${String(n)}`;
  return {
    id,
    item_id: ITEM,
    file_name: `photo-${String(n)}.png`,
    media_type: "image/png",
    size_bytes: 2048 * n,
    width: 800,
    height: 600,
    content_hash: "b3:abc",
    url: `/api/v1/attachments/${id}`,
    thumbnail_url: `/api/v1/attachments/${id}/thumbnail`,
    created_at: "2026-10-17T08:00:00Z",
    updated_at: "2026-10-17T08:00:00Z",
    version: 1,
    ...overrides,
  };
}

function server(list: Attachment[]) {
  let current = [...list];
  const calls = stubApi({
    "GET /items/*/attachments": () => json({ data: current }),
    "POST /items/*/attachments": (call: Call) => {
      const created = attachment(9, { id: call.headers.get("X-Attachment-Id") ?? "x", file_name: "shot.png" });
      current = [...current, created];
      return json(created, 201);
    },
    "DELETE /attachments/*": (call: Call) => {
      current = current.filter((a) => !call.path.endsWith(a.id));
      return json({
        id: "x",
        deleted_at: "2026-10-17T09:00:00Z",
        delete_batch_id: "0199f000-0000-7000-8000-0000000000bb",
      });
    },
  });
  return calls;
}

const png = (name = "shot.png") => new File([PNG], name, { type: "image/png" });

describe("attachments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows thumbnails and a preview that steps with the arrow keys", async () => {
    server([attachment(1), attachment(2)]);
    renderWithProviders(<Attachments itemId={ITEM} editable={false} />);
    expect(await screen.findByRole("img", { name: "photo-1.png" })).toHaveAttribute(
      "src",
      `/api/v1/attachments/${attachment(1).id}/thumbnail`,
    );
    expect(screen.queryByRole("button", { name: "Add image" })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Open photo-1.png" }));
    let dialog = await screen.findByRole("dialog", { name: "photo-1.png" });
    expect(within(dialog).getByText("800 × 600 · 2 KB")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute("download", "photo-1.png");
    fireEvent.keyDown(within(dialog).getByRole("img"), { key: "ArrowRight" });
    dialog = await screen.findByRole("dialog", { name: "photo-2.png" });
    expect(within(dialog).getByText("2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(within(dialog).getByRole("img"), { key: "ArrowRight" });
    expect(await screen.findByRole("dialog", { name: "photo-1.png" })).toBeInTheDocument();
  });

  it("uploads a picked image as the raw body with its name and a UUIDv7", async () => {
    const calls = server([]);
    renderWithProviders(<Attachments itemId={ITEM} editable />);
    await userEvent.setup().upload(await screen.findByLabelText("Add image"), png("Скриншот.png"));
    expect(await screen.findByText("Image “Скриншот.png” added.")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect(post?.path).toBe(`/items/${ITEM}/attachments`);
    expect(post?.headers.get("Content-Type")).toBe("image/png");
    expect(post?.headers.get("X-File-Name")).toBe(encodeURIComponent("Скриншот.png"));
    expect(post?.headers.get("X-Attachment-Id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await screen.findByRole("img", { name: "shot.png" })).toBeInTheDocument();
  });

  it("refuses a file that is not an image before sending it", async () => {
    const calls = server([]);
    renderWithProviders(<Attachments itemId={ITEM} editable />);
    const fake = new File(["just text"], "notes.png", { type: "image/png" });
    await userEvent.setup({ applyAccept: false }).upload(await screen.findByLabelText("Add image"), fake);
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a PNG, JPEG, WebP or GIF image.");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("attaches a pasted screenshot and a dropped image", async () => {
    const calls = server([]);
    renderWithProviders(<Attachments itemId={ITEM} editable />);
    const area = await screen.findByRole("region", { name: "Images" });
    fireEvent.paste(area, { clipboardData: { items: [{ kind: "file", getAsFile: () => png("paste.png") }] } });
    fireEvent.drop(area, { dataTransfer: { files: [png("drop.png")] } });
    await waitFor(() => {
      expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    });
    expect(calls.filter((c) => c.method === "POST").map((c) => c.headers.get("X-File-Name"))).toEqual([
      "paste.png",
      "drop.png",
    ]);
  });

  it("deletes an image and offers Undo", async () => {
    const calls = server([attachment(1)]);
    renderWithProviders(<Attachments itemId={ITEM} editable />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Delete photo-1.png" }));
    expect(await screen.findByText("Image “photo-1.png” deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/attachments/${attachment(1).id}`);
    await waitFor(() => {
      expect(screen.queryByRole("img", { name: "photo-1.png" })).not.toBeInTheDocument();
    });
  });
});

describe("image helpers", () => {
  it("recognise the four image types by their first bytes", () => {
    expect(imageTypeOf(PNG)).toBe("image/png");
    expect(imageTypeOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageTypeOf(new TextEncoder().encode("GIF89a..."))).toBe("image/gif");
    expect(imageTypeOf(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("image/webp");
    expect(imageTypeOf(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  });

  it("make time-ordered version 7 ids", () => {
    const first = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_000_001);
    expect(first < later).toBe(true);
    expect(first.slice(14, 15)).toBe("7");
    expect(first.slice(0, 13)).toBe("018bcfe5-6800");
  });
});
