// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Atom accounts.password_policy.v1 — TypeScript implementation
// (contract: atoms/accounts.password_policy.v1/contract.json). Used for live hints in forms; the server stays
// authoritative. The common-password list is imported from the backend data file (single source of truth).
import commonPasswordsText from "../../../../backend/src/haalendar/accounts/data/common_passwords.txt?raw";

export type PasswordViolation =
  "too_short" | "too_long" | "common" | "contains_email" | "contains_name" | "low_variety";

export const MIN_LENGTH = 15;
const MAX_LENGTH = 128;
const MIN_CONTEXT_WORD = 4;
const MIN_DISTINCT_CHARS = 5;

let commonPasswords: Set<string> | null = null;

function common(): Set<string> {
  commonPasswords ??= new Set(
    commonPasswordsText.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith("#")),
  );
  return commonPasswords;
}

/** Number of Unicode code points (Python len() semantics), not UTF-16 units. */
function codePoints(value: string): string[] {
  return Array.from(value);
}

export function checkPassword(
  password: string,
  email?: string | null,
  displayName?: string | null,
): PasswordViolation[] {
  const normalized = password.normalize("NFKC");
  const lowered = normalized.toLowerCase();
  const length = codePoints(normalized).length;
  const violations: PasswordViolation[] = [];
  if (length < MIN_LENGTH) violations.push("too_short");
  if (length > MAX_LENGTH) violations.push("too_long");
  if (common().has(lowered)) violations.push("common");
  const localPart = (email ?? "").split("@", 1)[0]?.trim().toLowerCase() ?? "";
  if (codePoints(localPart).length >= MIN_CONTEXT_WORD && lowered.includes(localPart)) {
    violations.push("contains_email");
  }
  const nameWords = (displayName ?? "")
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter((word) => codePoints(word).length >= MIN_CONTEXT_WORD)
    .map((word) => word.toLowerCase());
  if (nameWords.some((word) => lowered.includes(word))) violations.push("contains_name");
  if (new Set(codePoints(normalized)).size < MIN_DISTINCT_CHARS) violations.push("low_variety");
  return violations;
}
