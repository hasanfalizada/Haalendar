// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-042. WCAG contrast of the palette in both themes (FR-X-13, D-47), read
// straight from the tokens in styles.css: text on the 16 % tint ≥ 4.5:1 (1.4.3) and the colour bar / swatch against the
// page ≥ 3:1 (1.4.11). Fails when a token is changed to a value that breaks either rule.
import { describe, expect, it } from "vitest";

import styles from "../styles.css?raw";

import { COLORS } from "./palette";

const TINT = 0.16;

function block(selector: string): Record<string, string> {
  const start = styles.indexOf(`${selector} {`);
  const body = styles.slice(start, styles.indexOf("}", start));
  const pairs = [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m): [string, string] => [
    m[1] ?? "",
    m[2] ?? "",
  ]);
  return Object.fromEntries(pairs);
}

const light = block(":root");
const dark = { ...light, ...block('[data-theme="dark"]') };

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** color-mix(in srgb, colour p, background) */
function mix(color: string, background: string, p: number): string {
  const c = channels(color);
  const bg = channels(background);
  return `#${c
    .map((v, i) =>
      Math.round(v * p + (bg[i] ?? 0) * (1 - p))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// The approved values (design system, D-47): a change here is a design decision, not a refactoring.
const APPROVED = {
  light: {
    red: "#dc2626",
    orange: "#ea580c",
    yellow: "#b88a00",
    green: "#16a34a",
    blue: "#2563eb",
    purple: "#9333ea",
    brown: "#92400e",
    black: "#1f2937",
  },
  dark: {
    red: "#dc2626",
    orange: "#ea580c",
    yellow: "#eab308",
    green: "#16a34a",
    blue: "#2563eb",
    purple: "#9333ea",
    brown: "#a8622a",
    black: "#9ca3af",
  },
} as const;

describe("palette values", () => {
  it("match the design system in both themes", () => {
    for (const [theme, tokens] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      const actual = Object.fromEntries(COLORS.map((c) => [c, tokens[`ev-${c}`]?.toLowerCase()]));
      expect(actual, theme).toEqual(APPROVED[theme]);
    }
  });
});

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("palette contrast — %s theme", (_theme, tokens) => {
  const bg = tokens.bg ?? "";
  const fg = tokens.fg ?? "";

  it.each(COLORS.map((c) => [c]))("%s", (color) => {
    const value = tokens[`ev-${color}`];
    expect(value, `--ev-${color} defined`).toMatch(/^#[0-9a-fA-F]{6}$/);
    const tint = mix(value ?? "", bg, TINT);
    expect(contrast(fg, tint), "text on the tint").toBeGreaterThanOrEqual(4.5);
    expect(contrast(value ?? "", bg), "colour bar against the page").toBeGreaterThanOrEqual(3);
  });
});

// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-117. The due badges (D-95): their text on their background ≥ 4.5:1.
describe.each([
  ["light", light],
  ["dark", dark],
] as const)("due badges — %s theme", (_theme, tokens) => {
  it.each([
    ["overdue", "danger", "danger-bg"],
    ["due soon", "warn-fg", "warn-bg"],
  ])("%s", (_name, text, background) => {
    expect(
      contrast(tokens[text] ?? "", tokens[background] ?? ""),
      `--${text} on --${background}`,
    ).toBeGreaterThanOrEqual(4.5);
  });
});
