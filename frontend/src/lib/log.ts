// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Minimal structured client logger: debug output only in development,
// warnings/errors always. Never pass secrets or item contents (instructions: no sensitive data in logs).
type Fields = Record<string, unknown>;

const isDev = import.meta.env.DEV;

function write(level: "debug" | "info" | "warn" | "error", event: string, fields: Fields = {}): void {
  if (!isDev && (level === "debug" || level === "info")) return;
  const entry = { ts: new Date().toISOString(), level, event, ...fields };
  // eslint-disable-next-line no-console -- this module is the single sanctioned console writer
  console[level === "debug" ? "log" : level](`[haalendar] ${event}`, entry);
}

export const log = {
  debug: (event: string, fields?: Fields) => {
    write("debug", event, fields);
  },
  info: (event: string, fields?: Fields) => {
    write("info", event, fields);
  },
  warn: (event: string, fields?: Fields) => {
    write("warn", event, fields);
  },
  error: (event: string, fields?: Fields) => {
    write("error", event, fields);
  },
};

// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Readable form of a thrown value: the generated API client throws
// the parsed problem body (a plain object), which String() would render as "[object Object]".
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
