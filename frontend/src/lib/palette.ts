// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-042. The shared colour palette (FR-X-13, D-47): the 8 legacy colours in
// their fixed order, brown by default. The order and names follow the contract (Color enum); palette.test checks that
// contract, backend and this list agree, palette-contrast.test checks WCAG contrast in both themes.
import type { Color } from "@/api/generated/types.gen";

export const COLORS: readonly Color[] = ["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"];
export const DEFAULT_COLOR: Color = "brown";

/** Classes for an item row or card: colour, 16 % tint and the 4 px colour bar (styles.css). */
export function itemColorClasses(color: Color | null | undefined): string {
  return `ev-${color ?? DEFAULT_COLOR} ev-tint ev-bar`;
}

/** Classes for a filled colour sample. */
export function swatchClasses(color: Color): string {
  return `ev-${color} ev-swatch`;
}
