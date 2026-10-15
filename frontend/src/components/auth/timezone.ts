// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Default time zone for new accounts: the browser's IANA zone.
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
