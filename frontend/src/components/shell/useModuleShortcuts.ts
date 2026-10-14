// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Alt+1/2/3 switch modules (FR-X-08, design system section 8).
// Ignored while the user types in a field so shortcuts never steal text input.
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { log } from "@/lib/log";

import { MODULE_ITEMS } from "./nav-items";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useModuleShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      // event.code is layout-independent (works with Russian/Azerbaijani keyboard layouts too).
      const digit = event.code.startsWith("Digit") ? event.code.slice(5) : undefined;
      const item = MODULE_ITEMS.find((candidate) => candidate.shortcutDigit === digit);
      if (!item) return;
      event.preventDefault();
      log.debug("shortcut_navigate", { to: item.to });
      void navigate({ to: item.to });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigate]);
}
