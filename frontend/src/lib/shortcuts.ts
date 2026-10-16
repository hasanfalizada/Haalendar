// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Keyboard shortcut registry (FR-X-08, design system section 8, D-42).
// Every shortcut is registered with a group and a label, so the "?" overlay lists exactly what works on the current
// page. One window listener dispatches: keys are matched by physical position (event.code), so they work with any
// keyboard layout; "Mod" is Ctrl or Cmd. Nothing fires while focus is in a text field or behind an open dialog unless
// the shortcut allows it. The newest registration of a key wins (a page can take over a global key). Shortcuts handled
// by a focused widget itself (list navigation) are registered "for display" only.
import { useEffect, useRef, useSyncExternalStore } from "react";

import { log } from "./log";

export type ShortcutGroup = "general" | "navigation" | "items" | "editing";

export interface ShortcutSpec {
  id: string;
  /** Alternatives, e.g. ["Mod+Shift+Z", "Ctrl+Y"]; parts: Mod, Ctrl, Alt, Shift and one key. */
  keys: readonly string[];
  group: ShortcutGroup;
  /** Translation key of the description. */
  label: string;
  labelValues?: Record<string, string>;
  /** Without a handler the shortcut is only listed (the focused widget handles the key itself). */
  handler?: (event: KeyboardEvent) => void;
  allowInFields?: boolean;
  allowInDialog?: boolean;
  enabled?: boolean;
}

interface Entry {
  spec: ShortcutSpec;
  order: number;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: ShortcutSpec[] = [];
let counter = 0;

export const IS_APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function changed(): void {
  snapshot = [...entries.values()].sort((a, b) => a.order - b.order).map((e) => e.spec);
  listeners.forEach((listener) => {
    listener();
  });
}

const NAMED: Record<string, string> = {
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Space: "Space",
  Enter: "Enter",
  Esc: "Escape",
  Delete: "Delete",
  Home: "Home",
  End: "End",
};

interface Combo {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
}

export function parseCombo(keys: string): Combo {
  const parts = keys.split("+");
  const key = parts[parts.length - 1] ?? "";
  const has = (name: string) => parts.slice(0, -1).includes(name);
  let code: string;
  let shift = has("Shift");
  if (key === "?") {
    code = "Slash";
    shift = true;
  } else if (/^[A-Z]$/.test(key)) code = `Key${key}`;
  else if (/^\d$/.test(key)) code = `Digit${key}`;
  else code = NAMED[key] ?? key;
  return { mod: has("Mod"), ctrl: has("Ctrl"), alt: has("Alt"), shift, code };
}

export function matches(event: KeyboardEvent, keys: string): boolean {
  // "?" by the character as well: where the layout puts it elsewhere than Shift+/.
  if (keys === "?" && event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) return true;
  const combo = parseCombo(keys);
  const code = event.code || (event.key === " " ? "Space" : event.key);
  if (code !== combo.code) return false;
  const control = combo.mod ? event.ctrlKey || event.metaKey : event.ctrlKey === combo.ctrl && !event.metaKey;
  return control && event.altKey === combo.alt && event.shiftKey === combo.shift;
}

// Inputs that take no text (a checkbox, a button) do not block single-key shortcuts.
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return ["TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.repeat) return;
  const typing = isTypingTarget(event.target);
  const inDialog = dialogOpen();
  const candidates = [...snapshot].reverse();
  for (const spec of candidates) {
    if (!spec.handler || spec.enabled === false) continue;
    if (typing && !spec.allowInFields) continue;
    if (inDialog && !spec.allowInDialog) continue;
    if (!spec.keys.some((keys) => matches(event, keys))) continue;
    event.preventDefault();
    log.debug("shortcut", { id: spec.id });
    spec.handler(event);
    return;
  }
}

export function registerShortcut(spec: ShortcutSpec): () => void {
  if (entries.size === 0) window.addEventListener("keydown", onKeyDown);
  counter += 1;
  const token = `${spec.id}#${String(counter)}`;
  entries.set(token, { spec, order: counter });
  changed();
  return () => {
    entries.delete(token);
    if (entries.size === 0) window.removeEventListener("keydown", onKeyDown);
    changed();
  };
}

/** Register a shortcut while the component is mounted; the handler may change between renders. */
export function useShortcut(spec: ShortcutSpec): void {
  const handler = useRef(spec.handler);
  useEffect(() => {
    handler.current = spec.handler;
  });
  const hasHandler = spec.handler !== undefined;
  const { id, group, label, allowInFields, allowInDialog, enabled = true } = spec;
  const keys = spec.keys.join(" ");
  const values = JSON.stringify(spec.labelValues ?? {});
  useEffect(() => {
    if (!enabled) return undefined;
    return registerShortcut({
      id,
      keys: keys.split(" "),
      group,
      label,
      labelValues: JSON.parse(values) as Record<string, string>,
      ...(hasHandler ? { handler: (event: KeyboardEvent) => handler.current?.(event) } : {}),
      ...(allowInFields ? { allowInFields } : {}),
      ...(allowInDialog ? { allowInDialog } : {}),
    });
  }, [id, keys, group, label, values, hasHandler, allowInFields, allowInDialog, enabled]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shortcuts registered right now, oldest first, without duplicates of the same id. */
export function useRegisteredShortcuts(): ShortcutSpec[] {
  const all = useSyncExternalStore(subscribe, () => snapshot);
  const seen = new Set<string>();
  return all.filter((spec) => (seen.has(spec.id) ? false : (seen.add(spec.id), true)));
}

const SYMBOLS: Record<string, string> = {
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Delete: IS_APPLE ? "⌦" : "Del",
};

/** Key caps for display: Mod → Ctrl or ⌘, arrows as symbols. */
export function keyCaps(keys: string): string[] {
  return keys.split("+").map((part) => {
    if (part === "Mod") return IS_APPLE ? "⌘" : "Ctrl";
    if (part === "Alt") return IS_APPLE ? "⌥" : "Alt";
    if (part === "Shift") return IS_APPLE ? "⇧" : "Shift";
    return SYMBOLS[part] ?? part;
  });
}
