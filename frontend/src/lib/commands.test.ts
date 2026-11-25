// +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The palette's commands: all of them while nothing
// is typed; with words the matching ones, then "Create …" with the words (a card only on boards the user may write
// to and that have a column, the open one first, at most five).
import { describe, expect, it } from "vitest";

import { type CommandInput, pickCommands } from "./commands";

const t = (key: string, values?: Record<string, string>) =>
  values ? `${key}(${Object.values(values).join("|")})` : key;

const boards = [
  { id: "b1", name: "Revamp" },
  { id: "b2", name: "Home" },
  { id: "b3", name: "Shared view" },
  { id: "b4", name: "Empty" },
];

const input = (extra: Partial<CommandInput> = {}): CommandInput => ({
  boards,
  writable: new Set(["b1", "b2", "b4"]),
  firstColumn: (id) => (id === "b4" ? undefined : `${id}-c1`),
  admin: false,
  t,
  ...extra,
});

const ids = (query: string, extra?: Partial<CommandInput>) => pickCommands(input(extra), query).map((c) => c.id);

describe("pickCommands", () => {
  it("lists where to go and what to create while nothing is typed", () => {
    expect(ids("")).toEqual([
      "go:/calendar",
      "go:/todo",
      "go:/kanban",
      "go:/trash",
      "go:/settings",
      "go:today",
      "go:board:b1",
      "go:board:b2",
      "go:board:b3",
      "go:board:b4",
      "new:event",
      "new:note",
      "new:list",
    ]);
    expect(ids("  ", { admin: true })).toContain("go:/admin");
    expect(pickCommands(input(), "")[0]).toMatchObject({ label: "nav.calendar", keys: "Alt+1" });
  });

  it("keeps the matching commands, then offers to create with the words", () => {
    expect(ids("rev")).toEqual(["go:board:b1", "titled:event", "titled:note", "titled:card:b1", "titled:card:b2"]);
    // "plan" begins no word of the board's name: only "Create …" is offered.
    const [event, , card] = pickCommands(input(), " Revamp plan ");
    expect(event?.action).toEqual({ kind: "newEvent", title: "Revamp plan" });
    expect(card?.action).toEqual({ kind: "newCard", boardId: "b1", columnId: "b1-c1", title: "Revamp plan" });
    expect(card?.label).toBe("commands.createCard(Revamp plan|Revamp)");
  });

  it("matches word starts in any order, case and accents ignored", () => {
    const named = input({ t: (key) => (key === "commands.newNote" ? "Nouvelle note" : key) });
    expect(pickCommands(named, "NOTE nouv").map((c) => c.id)).toContain("new:note");
    expect(pickCommands(named, "ote").map((c) => c.id)).not.toContain("new:note");
  });

  it("offers the open board first for a card, at most five boards", () => {
    expect(ids("x", { currentBoard: "b2" }).filter((id) => id.startsWith("titled:card"))).toEqual([
      "titled:card:b2",
      "titled:card:b1",
    ]);
    const many = Array.from({ length: 8 }, (_, n) => ({ id: `m${String(n)}`, name: `Board ${String(n)}` }));
    const lots = input({ boards: many, writable: new Set(many.map((b) => b.id)), firstColumn: () => "c" });
    expect(pickCommands(lots, "x").filter((c) => c.id.startsWith("titled:card"))).toHaveLength(5);
  });
});
