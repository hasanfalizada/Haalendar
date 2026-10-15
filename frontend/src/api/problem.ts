// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. RFC 9457 problem helpers: the generated client returns the parsed
// problem body as `error`; these guards keep the UI code free of casts.
import type { Problem } from "./generated/types.gen";

export type ProblemCode = Problem["code"];

export function isProblem(value: unknown): value is Problem {
  return typeof value === "object" && value !== null && "code" in value && "status" in value;
}

/** Error object carrying a problem body, so query functions can throw it (and problemCode still reads it). */
export class ApiError extends Error {
  readonly problem: unknown;

  constructor(problem: unknown) {
    super(isProblem(problem) ? problem.code : "api_error");
    this.name = "ApiError";
    this.problem = problem;
  }
}

export function problemCode(value: unknown): ProblemCode | null {
  if (value instanceof ApiError) return problemCode(value.problem);
  return isProblem(value) ? value.code : null;
}

/** Field errors keyed by the top-level JSON Pointer segment, e.g. "/password" → "password". */
export function fieldErrorsOf(problem: Problem): { field: string; detail: string; code: string | undefined }[] {
  return (problem.errors ?? []).map((err) => ({ field: err.pointer.slice(1), detail: err.detail, code: err.code }));
}
