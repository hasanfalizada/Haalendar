// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Application shell (wireframes D1/M2): icon rail on ≥ md screens,
// top bar + slide-out drawer on phones. Active route is exposed with aria-current for assistive technology.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin-only items are shown to administrators only.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. The signed-in user's avatar links to the profile (Settings).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Notice when the device and profile time zones differ.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. A write that finds the session expired offers "Sign in", which
// returns to the current page afterwards (drafts bring the text back).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo / redo shortcuts for the signed-in user.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Shortcut overlay button in the rail ("?" anywhere); navigation,
// header and content are regions for F6 / Shift+F6.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. The avatar opens the user menu (rail dropdown, drawer list). A
// drawer entry that focuses its target keeps the focus there when the drawer closes.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The user's settings are applied on this device (theme sync).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { meQuery, meQueryKey } from "@/api/session";
import { setSessionExpiredHandler } from "@/api/write";
import { Button } from "@/components/ui/button";
import { useSettingsSync } from "@/components/settings/useSettingsSync";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { ConnectionStatus } from "./ConnectionStatus";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { TimeZoneMismatch } from "./TimeZoneMismatch";
import { UserMenuButton, UserMenuList } from "./UserMenu";
import { MODULE_ITEMS, SECONDARY_ITEMS, type NavItem } from "./nav-items";
import { useModuleShortcuts } from "./useModuleShortcuts";
import { useUndoShortcuts } from "./useUndoShortcuts";
import { useUserMenu } from "./useUserMenu";

const LOGO_SRC = "/icon.svg";

function RailLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const label = t(item.labelKey);
  const title = item.shortcutDigit ? `${label} · ${t("nav.shortcut", { keys: `Alt+${item.shortcutDigit}` })}` : label;
  return (
    <Link
      to={item.to}
      aria-label={label}
      title={title}
      className="flex size-10 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg"
      activeProps={{ className: "bg-primary-tint !text-primary", "aria-current": "page" }}
    >
      <item.icon className="size-5" aria-hidden />
    </Link>
  );
}

function DrawerLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { t } = useTranslation();
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className="flex h-11 items-center gap-3 rounded-sm px-3 font-medium text-fg hover:bg-surface"
      activeProps={{ className: "bg-primary-tint !text-primary", "aria-current": "page" }}
    >
      <item.icon className="size-5" aria-hidden />
      {t(item.labelKey)}
    </Link>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerFocusMoved = useRef(false);
  const { data: me } = useQuery(meQuery);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const here = useRouterState({ select: (state) => state.location.href });
  useEffect(() => {
    setSessionExpiredHandler(() => {
      // The cached profile still says "signed in"; forget it so the sign-in page does not bounce back.
      queryClient.setQueryData(meQueryKey, null);
      void navigate({ to: "/login", search: { redirect: here } });
    });
    return () => {
      setSessionExpiredHandler(null);
    };
  }, [navigate, here, queryClient]);
  const secondaryItems = SECONDARY_ITEMS.filter((item) => !item.adminOnly || me?.role === "admin");
  const userMenu = useUserMenu();
  useModuleShortcuts();
  useSettingsSync();
  useUndoShortcuts(me?.id ?? null);
  const closeDrawer = () => {
    setDrawerOpen(false);
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-primary px-3 py-2 text-primary-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t("app.skipToContent")}
      </a>

      {/* Desktop / tablet: icon rail */}
      <nav
        aria-label={t("nav.label")}
        data-region="navigation"
        tabIndex={-1}
        className="hidden w-14 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-surface py-3 md:flex"
      >
        <img src={LOGO_SRC} alt={t("app.name")} width={32} height={32} className="mb-2 size-8" />
        {MODULE_ITEMS.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
        <div className="flex-1" />
        {secondaryItems.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
        <ShortcutsOverlay className="size-10" />
        <UserMenuButton actions={userMenu.actions} />
        <div className="mt-2">
          <ConnectionStatus compact />
        </div>
      </nav>

      {/* Phone: top bar with drawer */}
      <header
        data-region="header"
        tabIndex={-1}
        className="flex items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)] outline-none md:hidden"
      >
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("nav.openMenu")}
              className="size-11"
              data-user-menu-button
            >
              <Menu className="size-5" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent
            title={t("app.name")}
            closeLabel={t("nav.closeMenu")}
            onCloseAutoFocus={(event) => {
              if (drawerFocusMoved.current) event.preventDefault();
              drawerFocusMoved.current = false;
            }}
          >
            <nav aria-label={t("nav.label")} className="flex flex-col gap-1">
              {MODULE_ITEMS.map((item) => (
                <DrawerLink key={item.to} item={item} onNavigate={closeDrawer} />
              ))}
              <div className="my-2 border-t border-line" />
              {secondaryItems.map((item) => (
                <DrawerLink key={item.to} item={item} onNavigate={closeDrawer} />
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-3">
              <UserMenuList
                actions={userMenu.actions}
                onSelect={(action) => {
                  drawerFocusMoved.current = action.movesFocus ?? false;
                  closeDrawer();
                }}
              />
              <ConnectionStatus />
            </div>
          </SheetContent>
        </Sheet>
        <img src={LOGO_SRC} alt="" width={24} height={24} className="size-6" />
        <span className="font-semibold">{t("app.name")}</span>
      </header>

      <main id="main" data-region="content" tabIndex={-1} className="min-w-0 flex-1 overflow-auto outline-none">
        <TimeZoneMismatch />
        <Outlet />
      </main>
      {userMenu.dialogs}
    </div>
  );
}
