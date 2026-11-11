// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Password-policy helpers for forms (live hints and server
// violation codes), built on the shared atom accounts.password_policy.v1.
import { useTranslation } from "react-i18next";

import { checkPassword, MIN_LENGTH, type PasswordViolation } from "@/atoms/accounts/passwordPolicy";

export const VIOLATIONS: readonly PasswordViolation[] = [
  "too_short",
  "too_long",
  "common",
  "contains_email",
  "contains_name",
  "low_variety",
];

export function isViolation(value: string | undefined): value is PasswordViolation {
  return VIOLATIONS.includes(value as PasswordViolation);
}

export function passwordViolations(password: string, email?: string, displayName?: string): PasswordViolation[] {
  return password ? checkPassword(password, email, displayName) : [];
}

export function useViolationText(): (violation: PasswordViolation) => string {
  const { t } = useTranslation();
  return (violation) => t(`auth.violations.${violation}`, { min: MIN_LENGTH });
}
