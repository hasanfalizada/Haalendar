// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. New-password field with live hints from the shared policy atom
// (extracted from the setup wizard; reused by invitation and password-change pages).
import { useTranslation } from "react-i18next";

import { MIN_LENGTH, type PasswordViolation } from "@/atoms/accounts/passwordPolicy";
import { Field, Input } from "@/components/ui/input";

import { useViolationText } from "./password";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  violations: readonly PasswordViolation[];
  error?: string | undefined;
}

export function PasswordField({ id, label, value, onChange, violations, error }: PasswordFieldProps) {
  const { t } = useTranslation();
  const violationText = useViolationText();
  return (
    <Field
      id={id}
      label={label}
      error={error}
      hint={
        violations.length > 0 ? (
          <ul className="list-inside list-disc" aria-live="polite">
            {violations.map((v) => (
              <li key={v}>{violationText(v)}</li>
            ))}
          </ul>
        ) : (
          t("auth.passwordHint", { min: MIN_LENGTH })
        )
      }
    >
      {(aria) => (
        <Input
          {...aria}
          type="password"
          autoComplete="new-password"
          required
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      )}
    </Field>
  );
}
