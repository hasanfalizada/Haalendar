// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Shortcut registry: physical keys (any layout), Mod = Ctrl or Cmd,
// exact modifiers, no single keys in text fields, nothing behind dialogs unless allowed, newest registration wins,
// display-only entries, key caps.
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { keyCaps, matches, registerShortcut } from "./shortcuts";

const removers: (() => void)[] = [];
function add(...args: Parameters<typeof registerShortcut>) {
  removers.push(registerShortcut(...args));
}

describe("shortcut registry", () => {
  afterEach(() => {
    removers.splice(0).forEach((remove) => {
      remove();
    });
  });

  it("matches by physical key and exact modifiers", () => {
    const press = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
    // Russian layout: the Z key types "я" but its code stays KeyZ.
    expect(matches(press({ code: "KeyZ", key: "я", ctrlKey: true }), "Mod+Z")).toBe(true);
    expect(matches(press({ code: "KeyZ", key: "z", metaKey: true }), "Mod+Z")).toBe(true);
    expect(matches(press({ code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true }), "Mod+Z")).toBe(false);
    expect(matches(press({ code: "KeyY", key: "y", metaKey: true }), "Ctrl+Y")).toBe(false);
    expect(matches(press({ code: "Digit1", key: "1", altKey: true }), "Alt+1")).toBe(true);
    expect(matches(press({ code: "Slash", key: "?", shiftKey: true }), "?")).toBe(true);
    expect(matches(press({ code: "Digit7", key: "?", shiftKey: true }), "?")).toBe(true); // layouts with ? elsewhere
    expect(matches(press({ code: "ArrowDown", key: "ArrowDown", shiftKey: true }), "Shift+Down")).toBe(true);
  });

  it("dispatches outside fields and dialogs, newest registration first", () => {
    const older = vi.fn();
    const newer = vi.fn();
    const inField = vi.fn();
    add({ id: "a", keys: ["N"], group: "items", label: "x", handler: older });
    add({ id: "b", keys: ["N"], group: "items", label: "x", handler: newer });
    add({ id: "c", keys: ["F6"], group: "navigation", label: "x", handler: inField, allowInFields: true });
    render(
      <div>
        <input aria-label="field" />
      </div>,
    );
    const field = document.querySelector("input") as HTMLInputElement;

    fireEvent.keyDown(document.body, { code: "KeyN", key: "n" });
    expect(newer).toHaveBeenCalledOnce();
    expect(older).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { code: "KeyN", key: "n" });
    expect(newer).toHaveBeenCalledOnce();
    fireEvent.keyDown(field, { code: "F6", key: "F6" });
    expect(inField).toHaveBeenCalledOnce();

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    fireEvent.keyDown(document.body, { code: "KeyN", key: "n" });
    expect(newer).toHaveBeenCalledOnce();
    dialog.remove();
  });

  it("ignores display-only entries and disabled ones", () => {
    const handler = vi.fn();
    add({ id: "list", keys: ["Down"], group: "items", label: "x" });
    add({ id: "off", keys: ["Down"], group: "items", label: "x", handler, enabled: false });
    const event = new KeyboardEvent("keydown", { code: "ArrowDown", key: "ArrowDown", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("shows key caps for this platform", () => {
    expect(keyCaps("Mod+Shift+Z")).toEqual(["Ctrl", "Shift", "Z"]);
    expect(keyCaps("Shift+Up")).toEqual(["Shift", "↑"]);
  });
});
