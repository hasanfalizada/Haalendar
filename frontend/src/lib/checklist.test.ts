// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Checklist logic (D-88): groups, positions kept where they fit, what
// Save writes, where an unchecked item goes back.
import { describe, expect, it } from "vitest";

import { checklistChanges, checklistOf, entriesOf, reposition, uncheckedIndex } from "./checklist";
import { comparePositions } from "./position";

const item = (id: string, text: string, position: string, checked = false, extra: object = {}) => ({
  id,
  item_id: "n1",
  text,
  position,
  checked,
  deleted_at: null,
  ...extra,
});

const stored = [
  item("a", "Milk", "M"),
  item("b", "Bread", "U", true),
  item("c", "Eggs", "k"),
  item("d", "Old", "A", false, { deleted_at: "2026-10-01T00:00:00Z" }),
  { ...item("e", "Other note", "B"), item_id: "n2" },
];

describe("checklists", () => {
  it("groups a note's live items: unchecked by position, then checked", () => {
    const groups = checklistOf(stored, "n1");
    expect(groups.unchecked.map((row) => row.id)).toEqual(["a", "c"]);
    expect(groups.checked.map((row) => row.id)).toEqual(["b"]);
    expect(entriesOf(groups)).toEqual([
      { id: "a", text: "Milk", checked: false },
      { id: "c", text: "Eggs", checked: false },
      { id: "b", text: "Bread", checked: true },
    ]);
  });

  it("keeps positions that still fit and gives moved or new items a key between their neighbours", () => {
    expect(reposition(["A", "M", "U"])).toEqual(["A", "M", "U"]);
    const moved = reposition(["U", "A", "M"]);
    expect(moved.slice(1)).toEqual(["A", "M"]);
    const fresh = reposition(["A", null, "M", null]);
    expect([fresh[0], fresh[2]]).toEqual(["A", "M"]);
    expect([...fresh].sort(comparePositions)).toEqual(fresh);
  });

  it("Save writes new, changed and removed items; a checked item keeps its position", () => {
    const changes = checklistChanges(
      "n1",
      checklistOf(stored, "n1").unchecked.concat(checklistOf(stored, "n1").checked),
      [
        { id: "c", text: "Eggs ", checked: false },
        { id: "a", text: "Oat milk", checked: true },
        { id: "x", text: "Butter", checked: false },
        { id: "y", text: "   ", checked: false },
        { id: "b", text: "Bread", checked: true },
      ],
    );
    expect(changes.create).toMatchObject([{ id: "x", data: { item_id: "n1", text: "Butter", checked: false } }]);
    const butter = String(changes.create[0]?.data.position);
    expect(comparePositions("k", butter)).toBeLessThan(0);
    expect(changes.update).toEqual([
      { id: "a", base: { text: "Milk", checked: false }, data: { text: "Oat milk", checked: true } },
    ]);
    expect(changes.remove).toEqual([]);
    expect(checklistChanges("n1", [item("a", "Milk", "M")], []).remove).toEqual(["a"]);
  });

  it("an unchecked item goes back before the first unchecked one with a later position", () => {
    const positions: Record<string, string> = { a: "M", c: "k", b: "U" };
    const entries = [
      { id: "a", text: "Milk", checked: false },
      { id: "c", text: "Eggs", checked: false },
    ];
    expect(uncheckedIndex(entries, "U", (id) => positions[id] ?? null)).toBe(1);
    expect(uncheckedIndex(entries, "A", (id) => positions[id] ?? null)).toBe(0);
    expect(uncheckedIndex(entries, null, (id) => positions[id] ?? null)).toBe(2);
  });
});
