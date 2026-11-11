// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. The TypeScript implementation must pass the shared cases.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/items.priority.v1/vectors.json";

import { filterByPriority, normalize, type Priority, type Ranked, sortByPriority } from "./priority";

type Case =
  | { name: string; input: { op: "normalize"; value: Priority | null }; output: Priority }
  | { name: string; input: { op: "sort"; items: Ranked[] }; output: string[] }
  | { name: string; input: { op: "filter"; items: Ranked[]; allowed: Priority[] }; output: string[] };

describe("items.priority.v1 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const { input } = testCase;
    if (input.op === "normalize") expect(normalize(input.value)).toBe(testCase.output);
    else if (input.op === "sort") expect(sortByPriority(input.items).map((i) => i.id)).toEqual(testCase.output);
    else expect(filterByPriority(input.items, input.allowed).map((i) => i.id)).toEqual(testCase.output);
  });
});
