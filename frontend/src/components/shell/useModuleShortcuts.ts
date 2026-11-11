// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Alt+1/2/3 switch modules (FR-X-08, design system section 8).
// Ignored while the user types in a field so shortcuts never steal text input.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Registered in the shortcut registry (listed in the "?" overlay); the
// registry does the matching (physical keys, text fields, dialogs).
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { registerShortcut } from "@/lib/shortcuts";

import { MODULE_ITEMS } from "./nav-items";

export { isTypingTarget } from "@/lib/shortcuts";

export function useModuleShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const removers = MODULE_ITEMS.filter((item) => item.shortcutDigit).map((item) =>
      registerShortcut({
        id: `module:${item.to}`,
        keys: [`Alt+${item.shortcutDigit ?? ""}`],
        group: "navigation",
        label: "shortcuts.goTo",
        labelValues: { module: item.labelKey },
        handler: () => void navigate({ to: item.to }),
      }),
    );
    return () => {
      removers.forEach((remove) => {
        remove();
      });
    };
  }, [navigate]);
}
