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
  // +++===+++ 2026-11-11 23:25 +04 — Hasan Alizada — HAAL-174 (UAT finding F8). A rule the form has refused is said
  // once, as the error: the hints leave it out instead of repeating it right above.
  const hints = violations.map((v) => ({ key: v, text: violationText(v) })).filter((hint) => hint.text !== error);
  const general = t("auth.passwordHint", { min: MIN_LENGTH });
  return (
    <Field
      id={id}
      label={label}
      error={error}
      hint={
        hints.length > 0 ? (
          <ul className="list-inside list-disc" aria-live="polite">
            {hints.map((hint) => (
              <li key={hint.key}>{hint.text}</li>
            ))}
          </ul>
        ) : violations.length > 0 || general === error ? undefined : (
          general
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
