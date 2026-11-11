// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile requests on the generated client. The avatar is sent as the
// raw request body (contract: no multipart); the server re-encodes it, so the limits here only save a round trip.
import { uploadAvatar } from "./generated/sdk.gen";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

export type AvatarProblem = "type" | "size";

export function avatarProblem(file: File): AvatarProblem | null {
  if (!AVATAR_TYPES.includes(file.type)) return "type";
  if (file.size > MAX_AVATAR_BYTES) return "size";
  return null;
}

export function uploadAvatarFile(file: File) {
  // The generated body type is `string` (binary schema); the File is passed through untouched (no serializer).
  return uploadAvatar({
    body: file as unknown as string,
    bodySerializer: null,
    headers: { "Content-Type": file.type },
  });
}
