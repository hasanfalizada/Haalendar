// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-060. Atom calendar.day_order.v1 — TypeScript implementation (contract:
// atoms/calendar.day_order.v1/contract.json). All-day first, then by start (a continuing entry counts as 00:00 and
// comes first), then by title — case and accents do not count — then by creation time and key. Colour never takes
// part (the legacy colour-name order is gone). Plain code-point comparisons, so the order matches the Python twin.
// +++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. Version 2 (atoms/calendar.day_order.v2, D-111): `by` is the
// user's setting — "time" orders as above (the colour does not count), "color" as the legacy app: by the legacy colour
// rank (black, purple, green, blue, red, yellow, orange, brown — its `colors.rank`), then by the title itself, case
// counting (code points, as SQLite's binary order), all-day and times not counting, then by creation time and key.
export type DayOrderBy = "time" | "color";

/** The legacy calendar's `colors.rank` (its day list was `order by rank, title`). */
const COLOR_RANK: Readonly<Record<string, number>> = {
  black: 0,
  purple: 1,
  green: 2,
  blue: 3,
  red: 4,
  yellow: 5,
  orange: 6,
  brown: 7,
};

export interface DayEntry {
  key: string;
  all_day: boolean;
  continues: boolean;
  /** HH:MM on this day in the viewer's zone; null for all-day entries. */
  start: string | null;
  title: string;
  /** The palette's name of the entry's colour. */
  color: string;
  created_at: string;
}

/** NFKD, combining marks (category M) removed, lower-cased. */
export function titleKey(title: string): string {
  return title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** By code points like Python (JavaScript's `<` compares UTF-16 units, which differs for emoji and rare scripts). */
function compareText(a: string, b: string): number {
  const [x, y] = [Array.from(a), Array.from(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const diff = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0);
    if (diff !== 0) return diff;
  }
  return x.length - y.length;
}

function sortKey(entry: DayEntry, by: DayOrderBy): [number, string, number, string, string, string, string] {
  if (by === "color") {
    return [COLOR_RANK[entry.color] ?? 8, "", 0, entry.title, entry.title, entry.created_at, entry.key];
  }
  const ties = [titleKey(entry.title), entry.title, entry.created_at, entry.key] as const;
  if (entry.all_day) return [0, "", 0, ...ties];
  return [1, entry.continues ? "00:00" : (entry.start ?? "00:00"), entry.continues ? 0 : 1, ...ties];
}

export function dayOrder(entries: readonly DayEntry[], by: DayOrderBy = "time"): string[] {
  const keyed = entries.map((entry) => ({ entry, key: sortKey(entry, by) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < a.key.length; i += 1) {
      const [x, y] = [a.key[i], b.key[i]];
      const result = typeof x === "number" && typeof y === "number" ? x - y : compareText(String(x), String(y));
      if (result !== 0) return result;
    }
    return 0;
  });
  return keyed.map(({ entry }) => entry.key);
}
