// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Checks before an image is sent (FR-X-11): the first bytes decide the
// type (PNG, JPEG, WebP, GIF — as on the server), at most 10 MB. Saves a round trip; the server checks again.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type ImageProblem = "type" | "size" | "empty";

export function imageTypeOf(head: Uint8Array): string | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  const text = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function checkImage(file: File): Promise<ImageProblem | null> {
  if (file.size === 0) return "empty";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return imageTypeOf(head) === null ? "type" : null;
}

/** Image files among dropped or pasted data (other files and text are left alone). */
export function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const files: File[] = [];
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = entry instanceof File ? entry : entry.kind === "file" ? entry.getAsFile() : null;
    if (file && file.type.startsWith("image/")) files.push(file);
  }
  return files;
}
