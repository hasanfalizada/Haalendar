// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-042. WCAG contrast of the palette in both themes (FR-X-13, D-47), read
// straight from the tokens in styles.css: text on the 16 % tint ≥ 4.5:1 (1.4.3) and the colour bar / swatch against the
// page ≥ 3:1 (1.4.11). Fails when a token is changed to a value that breaks either rule.
// +++===+++ 2026-11-23 10:30 +04 — Hasan Alizada — HAAL-192 (D-118). The tint is read from the .ev-tint rule (28 % now),
// and every two colours stay apart on the tint by ΔE2000 ≥ 9 in both themes (red, orange, yellow and brown were 4.0).
import { describe, expect, it } from "vitest";

import styles from "../styles.css?raw";

import { COLORS } from "./palette";

function block(selector: string): Record<string, string> {
  const start = styles.indexOf(`${selector} {`);
  const body = styles.slice(start, styles.indexOf("}", start));
  const pairs = [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m): [string, string] => [
    m[1] ?? "",
    m[2] ?? "",
  ]);
  return Object.fromEntries(pairs);
}

const TINT = Number(/\.ev-tint \{[^}]*var\(--ev\) (\d+)%/.exec(styles)?.[1]) / 100;

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
    red: "#e11d48",
    orange: "#ea580c",
    yellow: "#b88a00",
    green: "#16a34a",
    blue: "#2563eb",
    purple: "#9333ea",
    brown: "#704214",
    black: "#1f2937",
  },
  dark: {
    red: "#e11d48",
    orange: "#ea580c",
    yellow: "#eab308",
    green: "#16a34a",
    blue: "#2563eb",
    purple: "#9333ea",
    brown: "#9a6a4a",
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
    // +++===+++ 2026-11-12 00:15 +04 — Hasan Alizada — HAAL-174 (UAT finding F20). The time on an event chip is muted text on the
    // tint; measured live at 4.78:1 (brown, light) and 6.62:1 (dark), the reported 3.4:1 was not reproduced. Guards it.
    // HAAL-192 (D-118): on the tint the secondary text is --muted-on-tint (the .ev-tint rule sets --muted to it).
    expect(styles).toMatch(/\.ev-tint \{[^}]*--muted: var\(--muted-on-tint\)/);
    expect(contrast(tokens["muted-on-tint"] ?? "", tint), "muted text (the time) on the tint").toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(value ?? "", bg), "colour bar against the page").toBeGreaterThanOrEqual(3);
  });
});

/** CIELAB (D65) of an sRGB colour. */
function lab(hex: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

type Lab = [number, number, number];

/** CIEDE2000 colour difference of two Lab colours: about 2 is just noticeable, under 10 they read as close. */
function deltaE2000([L1, a1, b1]: Lab, [L2, a2, b2]: Lab): number {
  const rad = Math.PI / 180;
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const [a1p, a2p] = [(1 + g) * a1, (1 + g) * a2];
  const [c1, c2] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const hue = (b: number, a: number) => (((Math.atan2(b, a) / rad) % 360) + 360) % 360;
  const [h1, h2] = [hue(b1, a1p), hue(b2, a2p)];
  let dh = h2 - h1;
  if (c1 * c2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dL = L2 - L1;
  const dC = c2 - c1;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad);
  const lBar = (L1 + L2) / 2;
  const cBarP = (c1 + c2) / 2;
  let hBar = h1 + h2;
  if (c1 * c2 !== 0) hBar = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2;
  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * rad) +
    0.24 * Math.cos(2 * hBar * rad) +
    0.32 * Math.cos((3 * hBar + 6) * rad) -
    0.2 * Math.cos((4 * hBar - 63) * rad);
  const rc = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7));
  const rt = -Math.sin(2 * 30 * Math.exp(-(((hBar - 275) / 25) ** 2)) * rad) * rc;
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  return Math.sqrt((dL / sl) ** 2 + (dC / sc) ** 2 + (dH / sh) ** 2 + rt * (dC / sc) * (dH / sh));
}

describe("telling the colours apart", () => {
  it("computes ΔE2000 as the published test data (Sharma, Wu and Dalal 2005, pairs 1, 7 and 17)", () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(deltaE2000([50, 0, 0], [50, -1, 2])).toBeCloseTo(2.3669, 4);
    expect(deltaE2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as const)("every two colours differ by ΔE2000 ≥ 9 on the tint — %s theme", (_theme, tokens) => {
    const bg = tokens.bg ?? "";
    const close: string[] = [];
    COLORS.forEach((a, i) => {
      COLORS.slice(i + 1).forEach((b) => {
        const d = deltaE2000(lab(mix(tokens[`ev-${a}`] ?? "", bg, TINT)), lab(mix(tokens[`ev-${b}`] ?? "", bg, TINT)));
        if (d < 9) close.push(`${a}–${b} ${d.toFixed(1)}`);
      });
    });
    expect(close).toEqual([]);
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
