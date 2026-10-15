// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. The TypeScript implementation must pass the shared permission matrix.
import { describe, expect, it } from "vitest";

import vectors from "../../../../atoms/authz.check.v1/vectors.json";

import { type Action, check, type SharePermission } from "./check";

interface Case {
  name: string;
  input: {
    actor: { id: string; role: string };
    action: Action;
    resource: { owner_id: string; share_permission: SharePermission | null };
  };
  output: { allowed: boolean; deny_status: number | null; reason: string };
}

describe("authz.check.v1 (TypeScript)", () => {
  it.each((vectors as { cases: Case[] }).cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const { actor, action, resource } = testCase.input;
    expect(check(actor.id, action, resource.owner_id, resource.share_permission)).toEqual(testCase.output);
  });
});
