// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Text link styles (FR-X-17, D-53). A link that stands on its own
// ("Forgot password?", "Go to sign-in") is a 44 px touch target, compact only with a mouse from 768 px; a link inside a
// sentence keeps the line height (WCAG 2.5.8 inline exception).
export const INLINE_LINK = "font-medium text-primary underline-offset-4 hover:underline";

export const STANDALONE_LINK = `${INLINE_LINK} inline-flex min-h-11 items-center pointer-fine:md:min-h-0`;
