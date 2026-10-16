// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-032. Readable audit snapshot values and field names for history views.

const MAX_VALUE_CHARS = 80;

/** Short, readable form of a snapshot value (long text is shortened, structures are summarised). */
export function displayValue(value: unknown, empty: string): string {
  if (value === null || value === undefined || value === "") return empty;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

export function fieldLabel(field: string): string {
  const words = field.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
