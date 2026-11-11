// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. Positions of manually ordered records (domain model P6, D-87):
// fractional index keys of letters and digits, compared by code unit ("0" < "9" < "A" < "Z" < "a" < "z"), at most 64
// long. A new record on top gets a key from the time, falling with every millisecond (eight characters, so repeated
// "new on top" never grows the key); only when a key already sorts before it (moved there by hand, HAAL-103) the new
// key goes between the start and that key.
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;
const WIDTH = 8;
const SPAN = BASE ** WIDTH;

/** Ascending key order (not the locale's). */
export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A key after `a` ("" = the start) and before `b` (null = the end); keys never end in "0". */
export function keyBetween(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while (n < b.length && (a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + keyBetween(a.slice(n), b.slice(n));
  }
  const low = a ? DIGITS.indexOf(a.charAt(0)) : 0;
  const high = b !== null ? DIGITS.indexOf(b.charAt(0)) : BASE;
  if (high - low > 1) return DIGITS.charAt(Math.round((low + high) / 2));
  if (b !== null && b.length > 1) return b.charAt(0);
  return DIGITS.charAt(low) + keyBetween(a.slice(1), null);
}

/** The time key of `now` (milliseconds), smaller for later times. */
export function timeKey(now: number): string {
  let rest = SPAN - 1 - (Math.floor(now) % SPAN);
  let key = "";
  for (let i = 0; i < WIDTH; i++) {
    key = DIGITS.charAt(rest % BASE) + key;
    rest = Math.floor(rest / BASE);
  }
  return key.replace(/0+$/, "") || "1";
}

/** A key before every one of `existing`. */
export function topPosition(existing: readonly string[], now: number = Date.now()): string {
  const first = existing.reduce<string | null>(
    (lowest, key) => (lowest === null || comparePositions(key, lowest) < 0 ? key : lowest),
    null,
  );
  const key = timeKey(now);
  return first === null || comparePositions(key, first) < 0 ? key : keyBetween("", first);
}
