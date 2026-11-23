// +++===+++ 2026-11-23 13:40 +04 — Hasan Alizada — HAAL-039 (D-119). Search over the local items: folding, word starts,
// ranking, what is left out, highlights, snippets, and 100 000 items within 300 ms (SRS 4.3).
import { describe, expect, it } from "vitest";

import { fold, highlightRanges, matchesQuery, queryWords, searchItems, snippet, type SearchInput } from "./search";

const event = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "event",
  title,
  container_id: "cal",
  start_date: "2026-11-23",
  ...extra,
});

function input(items: Record<string, unknown>[], extra: Partial<SearchInput> = {}): SearchInput {
  return { items, checklistItems: [], boards: [], calendarShown: () => true, ...extra };
}

const titles = (rows: { row: Record<string, unknown> }[]) => rows.map((hit) => hit.row.title);

describe("folding and words", () => {
  it("ignores case and accents", () => {
    expect(fold("Café ÉCOLE Ärger")).toBe("cafe ecole arger");
    expect(queryWords("  «Café»,  planning! ")).toEqual(["cafe", "planning"]);
  });

  it("matches every word at the start of a word, in any order", () => {
    expect(matchesQuery("Sprint planning", "plan spr")).toBe(true);
    expect(matchesQuery("Sprint planning", "print")).toBe(false); // inside a word
    expect(matchesQuery("Sprint planning", "sprint review")).toBe(false); // every word must be there
    expect(matchesQuery("Встреча с Café-командой", "кафе")).toBe(false);
    expect(matchesQuery("Встреча с командой", "КОМ")).toBe(true);
    expect(matchesQuery("anything", "")).toBe(true);
  });
});

describe("searchItems", () => {
  it("groups by module and ranks the title first, its start highest", () => {
    const found = searchItems(
      input([
        event("1", "Weekly review", { body: "plan the sprint" }),
        event("2", "Sprint planning"),
        event("3", "Lunch", { location: "Sprint café" }),
        { id: "4", kind: "note", title: "Ideas", body: "sprint goals" },
        { id: "5", kind: "card", title: "Fix the sprint board", container_id: "b1" },
      ]),
      "sprint",
    );
    expect(titles(found.calendar)).toEqual(["Sprint planning", "Lunch", "Weekly review"]);
    expect(found.calendar.map((hit) => hit.field)).toEqual([null, "location", "body"]);
    expect(titles(found.todo)).toEqual(["Ideas"]);
    expect(titles(found.kanban)).toEqual(["Fix the sprint board"]);
  });

  it("finds checklist items of a note", () => {
    const found = searchItems(
      input([{ id: "n1", kind: "note", title: "Shopping" }], {
        checklistItems: [
          { id: "c1", item_id: "n1", text: "Milk" },
          { id: "c2", item_id: "n1", text: "Bread", deleted_at: "2026-11-01T00:00:00Z" },
        ],
      }),
      "milk",
    );
    expect(found.todo.map((hit) => hit.field)).toEqual(["checklist"]);
    expect(searchItems(input([{ id: "n1", kind: "note", title: "Shopping" }]), "bread").todo).toEqual([]);
  });

  it("leaves out deleted items, hidden calendars and cards of deleted boards", () => {
    const found = searchItems(
      input(
        [
          event("1", "Dentist", { deleted_at: "2026-11-01T00:00:00Z" }),
          event("2", "Dentist", { container_id: "hidden" }),
          event("3", "Dentist"),
          { id: "4", kind: "card", title: "Dentist", container_id: "gone" },
          { id: "5", kind: "calendar_thing", title: "Dentist" },
        ],
        {
          calendarShown: (id) => id !== "hidden",
          boards: [{ id: "gone", deleted_at: "2026-11-01T00:00:00Z" }],
        },
      ),
      "dentist",
    );
    expect(found.calendar.map((hit) => hit.row.id)).toEqual(["3"]);
    expect(found.kanban).toEqual([]);
    expect(found.todo).toEqual([]);
  });

  it("finds nothing for an empty query and keeps at most the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => event(String(i), `Stand-up ${String(i)}`));
    expect(searchItems(input(many), "  ").calendar).toEqual([]);
    expect(searchItems(input(many), "stand", 20).calendar).toHaveLength(20);
  });

  // The first search folds every item once (kept per row): up to about 0.2 s on a development server, so it gets 1 s
  // for slower machines; every search after it — each key typed — must stay within the 300 ms of SRS 4.3.
  it("searches 100 000 items: the first search within 1 s, every next one within 300 ms", () => {
    const words = ["alpha", "budget", "review", "dentist", "sprint", "garden", "invoice", "travel", "école", "meeting"];
    const items = Array.from({ length: 100_000 }, (_, i) => ({
      id: String(i),
      kind: ["event", "note", "card"][i % 3],
      container_id: "c",
      title: `${words[i % 10] ?? ""} ${words[(i * 7) % 10] ?? ""} number ${String(i)}`,
      body: `Some longer description about ${words[(i * 3) % 10] ?? ""} and more words to read through, item ${String(i)}.`,
    }));
    const data = input(items);
    const first = performance.now();
    const found = searchItems(data, "ecole rev");
    const cold = performance.now() - first;
    const again = performance.now();
    searchItems(data, "ecole revi");
    const warm = performance.now() - again;
    expect(found.calendar.length).toBeGreaterThan(0);
    expect(cold).toBeLessThan(1000);
    expect(warm).toBeLessThan(300);
  });
});

describe("highlights and snippets", () => {
  it("marks where the words begin words, accents kept in the text", () => {
    expect(highlightRanges("Café de l'École", "cafe ecole")).toEqual([
      [0, 4],
      [10, 15],
    ]);
    expect(highlightRanges("Sprint planning", "plan sprint")).toEqual([
      [0, 6],
      [7, 11],
    ]);
    expect(highlightRanges("Reprint", "print")).toEqual([]);
  });

  it("shows the part around the first match", () => {
    const long = `${"word ".repeat(40)}the dentist appointment ${"tail ".repeat(40)}`;
    const part = snippet(long, "dentist", 60);
    expect(part).toContain("dentist");
    expect(part.startsWith("…")).toBe(true);
    expect(part.endsWith("…")).toBe(true);
    expect(snippet("Short text", "short")).toBe("Short text");
  });
});
