// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Atom time.local_to_utc.v1 — TypeScript implementation (contract:
// atoms/time.local_to_utc.v1/contract.json). No dependency: offsets come from Intl.DateTimeFormat (the browser's IANA
// data). A local time is tried with the offsets in effect 14 h before and after it (the full range of UTC offsets);
// one valid candidate = exact, none = DST gap (use the offset before it), two = DST overlap (first occurrence).

export type Resolution = "exact" | "gap_shifted" | "overlap_first";

export interface LocalToUtc {
  utc: string;
  offset_minutes: number;
  resolution: Resolution;
}

export class UnknownTimeZoneError extends Error {
  constructor(tzid: string) {
    super(`Unknown time zone: ${tzid}`);
    this.name = "UnknownTimeZoneError";
  }
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const HOUR_MS = 3_600_000;

function formatter(tzid: string): Intl.DateTimeFormat {
  let found = formatters.get(tzid);
  if (!found) {
    try {
      found = new Intl.DateTimeFormat("en-US", {
        timeZone: tzid,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      throw new UnknownTimeZoneError(tzid);
    }
    formatters.set(tzid, found);
  }
  return found;
}

/** Wall-clock reading of an instant (epoch milliseconds) in a zone. */
export function wallClock(epochMs: number, tzid: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatter(tzid).formatToParts(new Date(epochMs))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function offsetMinutes(epochMs: number, tzid: string): number {
  const w = wallClock(epochMs, tzid);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60_000);
}

export function validateZone(tzid: string): void {
  formatter(tzid);
}

export function localToUtc(date: string, time: string, tzid: string): LocalToUtc {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const local = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetMinutes(local - 14 * HOUR_MS, tzid);
  const after = offsetMinutes(local + 14 * HOUR_MS, tzid);
  const valid = [...new Set([before, after])].filter((o) => offsetMinutes(local - o * 60_000, tzid) === o);

  let offset: number;
  let resolution: Resolution;
  if (valid.length === 1) {
    offset = valid[0] ?? before;
    resolution = "exact";
  } else if (valid.length === 0) {
    offset = before;
    resolution = "gap_shifted";
  } else {
    offset = Math.max(...valid); // the earlier instant
    resolution = "overlap_first";
  }
  const utc = `${new Date(local - offset * 60_000).toISOString().slice(0, 16)}:00Z`;
  return { utc, offset_minutes: offset, resolution };
}
