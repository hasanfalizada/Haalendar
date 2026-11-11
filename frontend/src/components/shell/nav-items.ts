// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Single definition of the module navigation (rail, drawer, shortcuts).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. "Users" (admin panel), shown to administrators only.
import { CalendarDays, Columns3, ListChecks, Settings, Trash2, UsersRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: "/calendar" | "/todo" | "/kanban" | "/trash" | "/admin" | "/settings";
  labelKey: "nav.calendar" | "nav.todo" | "nav.kanban" | "nav.trash" | "nav.users" | "nav.settings";
  icon: LucideIcon;
  /** Alt+<digit> shortcut (design system section 8); modules only. */
  shortcutDigit?: "1" | "2" | "3";
  adminOnly?: boolean;
}

export const MODULE_ITEMS: readonly NavItem[] = [
  { to: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, shortcutDigit: "1" },
  { to: "/todo", labelKey: "nav.todo", icon: ListChecks, shortcutDigit: "2" },
  { to: "/kanban", labelKey: "nav.kanban", icon: Columns3, shortcutDigit: "3" },
];

export const SECONDARY_ITEMS: readonly NavItem[] = [
  { to: "/trash", labelKey: "nav.trash", icon: Trash2 },
  { to: "/admin", labelKey: "nav.users", icon: UsersRound, adminOnly: true },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];
