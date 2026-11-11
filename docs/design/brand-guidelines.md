# Haalendar — Brand Guidelines

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-005. Concept B approved by owner (H monogram + check, teal + amber, Inter). Assets live in the code repository `branding/`.

## 1. Concept
- **Mark:** letter "H" formed by two vertical pillars (two Kanban columns / calendar days) crossed by a check mark (To-Do, done). It joins the three modules into one sign and the initial of the name.
- **Shape:** rounded square tile (corner radius ≈ 22 % of side), consistent with app icons on all platforms.
- **Name:** Haalendar (unchanged).

## 2. Color identity
Brand colors are taken from the Tailwind palette (teal, amber, gray) so that UI tokens map 1:1 to the planned frontend stack.

| Token | Hex | Use |
|---|---|---|
| `brand.primary` | `#0F766E` (teal-700) | Logo tile, primary buttons, active navigation |
| `brand.primary-hover` | `#115E59` (teal-800) | Hover/pressed state |
| `brand.primary-tint` | `#F0FDFA` (teal-50) | Selected rows, subtle highlights (light theme) |
| `brand.primary-dark-theme` | `#2DD4BF` (teal-400) | Primary in dark theme (with dark text) |
| `brand.accent` | `#F59E0B` (amber-500) | Check mark, small highlights, badges with dark text |
| `ink` | `#111827` (gray-900) | Body text on light backgrounds |
| `ink.dark-bg` | `#0B1220` | Reference dark background |

### Measured contrast (WCAG 2.x)
| Pair | Ratio | Result |
|---|---|---|
| White on primary `#0F766E` | 5.47:1 | AA normal text |
| White on primary-hover `#115E59` | 7.58:1 | AAA normal text |
| Primary `#0F766E` on tint `#F0FDFA` | 5.25:1 | AA normal text |
| Ink `#111827` on accent `#F59E0B` | 8.26:1 | AAA normal text |
| White on accent `#F59E0B` | 2.15:1 | **Fail — never use** |
| `#0B1220` on dark-theme primary `#2DD4BF` | 10.06:1 | AAA |
| Ink on white | 17.74:1 | AAA |

### Relation to event colors
The 8 legacy event colors (red, orange, yellow, green, blue, purple, brown, black) stay unchanged (FR-X-13). Teal is intentionally not one of them, so brand chrome is never confused with an event color.

## 3. Typography
- **Inter** (SIL OFL 1.1) — wordmark (SemiBold 600) and recommended UI typeface.
- Wordmark text is converted to outlines; no runtime font dependency.

## 4. Logo versions
| Version | File | Background |
|---|---|---|
| Mark, color | `logo-mark.svg` | Any |
| Mark, mono | `logo-mark-mono.svg` | Print / single color |
| Wordmark | `logo-wordmark.svg` | Light |
| Wordmark, dark | `logo-wordmark-dark.svg` | Dark |

## 5. Favicon and app icon set
| File | Size | Where used |
|---|---|---|
| `favicon.ico` | 16/32/48 | Legacy browsers, `/favicon.ico` |
| `icon.svg` | vector | `<link rel="icon" type="image/svg+xml">` |
| `apple-touch-icon.png` | 180 | iOS home screen (opaque square, iOS rounds it) |
| `icon-192.png`, `icon-512.png` | 192, 512 | Web app manifest `icons` |
| `icon-maskable-512.png` | 512 | Manifest icon with `"purpose": "maskable"`; glyph scaled to 80 % to stay inside the safe zone |

## 6. Rules
- Clear space ≥ 1/4 of mark width on all sides.
- Minimum size: mark 16 px; wordmark 120 px wide.
- Do not stretch, rotate, outline, recolor, add shadows/gradients, or place the color mark on busy images.
- On teal or dark backgrounds use the wordmark-dark version.

## 7. Trademark position
Apache-2.0 Section 6 does not grant trademark rights. Name and logo may be used to refer to the project; use implying endorsement of modified or third-party products is not permitted. Statement published in `branding/README.md` (code repository).

## 8. Regeneration
Assets were generated from vector definitions with resvg (rasterization) and opentype.js (text to outlines). Grid: 512 × 512; pillars x = 119 and 320, width 73, height 292 (y = 110), corner radius 27; check polyline (174,265) → (238,329) → (357,192), stroke 50, round caps.
