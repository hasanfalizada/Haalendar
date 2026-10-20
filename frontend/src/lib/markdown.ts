// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Markdown helpers without the parser (FR-X-20, D-51): the URL rule
// shared by renderer and tests (only http(s), mailto and tel survive) and the editor's bold/italic toggle. Kept apart
// from lib/markdown-text.ts so the editor does not pull the Markdown parser into the main bundle.

export const SAFE_PROTOCOLS: readonly string[] = ["http:", "https:", "mailto:", "tel:"];

/** The URL when its protocol is allowed, otherwise null (relative, javascript:, data:, vbscript:, …). */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return SAFE_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Wraps (or unwraps) the selection of `value` in `mark`; returns the new value and selection. */
export function toggleMark(
  value: string,
  start: number,
  end: number,
  mark: string,
): { value: string; start: number; end: number } {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  if (before.endsWith(mark) && after.startsWith(mark)) {
    return {
      value: before.slice(0, -mark.length) + selected + after.slice(mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  return { value: before + mark + selected + mark + after, start: start + mark.length, end: end + mark.length };
}
