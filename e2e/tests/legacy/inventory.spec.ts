// +++===+++ 2026-10-31 — Hasan Alizada — HAAL-141. The legacy regression suite is complete: every feature of
// docs/requirements/legacy-feature-inventory.md (F-xx) has exactly one scenario here whose title starts with its number,
// and no scenario names a feature the inventory does not have. Reads files only (no browser).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const inventory = resolve(here, "../../../docs/requirements/legacy-feature-inventory.md");

test("every legacy feature F-xx has exactly one scenario", () => {
  const section = readFileSync(inventory, "utf8").split("## 3.")[0] ?? "";
  const features = [...section.matchAll(/^\| (F-\d\d) \|/gm)].map((m) => m[1]);
  expect(features.length).toBeGreaterThan(20);

  const titles = readdirSync(here)
    .filter((name) => name.endsWith(".spec.ts"))
    .flatMap((name) => [...readFileSync(resolve(here, name), "utf8").matchAll(/test(?:\.fixme)?\(\s*"(F-\d\d) /g)])
    .map((m) => m[1]);
  expect([...titles].sort(), "scenarios per feature").toEqual([...features].sort());
});
