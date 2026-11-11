// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. The TypeScript implementation must pass the shared test vectors.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/accounts.password_policy.v1/vectors.json";

import { checkPassword } from "./passwordPolicy";

interface Case {
  name: string;
  input: { password: string; email?: string | null; display_name?: string | null };
  output: { valid: boolean; violations: string[] };
}

describe("accounts.password_policy.v1 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const violations = checkPassword(testCase.input.password, testCase.input.email, testCase.input.display_name);
    expect({ valid: violations.length === 0, violations }).toEqual(testCase.output);
  });
});
