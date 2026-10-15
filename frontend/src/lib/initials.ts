// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Up to two initials of a display name (Unicode-aware), "?" when empty.
export function initials(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}
