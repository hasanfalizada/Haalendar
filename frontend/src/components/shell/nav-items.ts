// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Single definition of the module navigation (rail, drawer, shortcuts).
import { CalendarDays, Columns3, ListChecks, Settings, Trash2, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: "/calendar" | "/todo" | "/kanban" | "/trash" | "/settings";
  labelKey: "nav.calendar" | "nav.todo" | "nav.kanban" | "nav.trash" | "nav.settings";
  icon: LucideIcon;
  /** Alt+<digit> shortcut (design system section 8); modules only. */
  shortcutDigit?: "1" | "2" | "3";
}

export const MODULE_ITEMS: readonly NavItem[] = [
  { to: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, shortcutDigit: "1" },
  { to: "/todo", labelKey: "nav.todo", icon: ListChecks, shortcutDigit: "2" },
  { to: "/kanban", labelKey: "nav.kanban", icon: Columns3, shortcutDigit: "3" },
];

export const SECONDARY_ITEMS: readonly NavItem[] = [
  { to: "/trash", labelKey: "nav.trash", icon: Trash2 },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];
