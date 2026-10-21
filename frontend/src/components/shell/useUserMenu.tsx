// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. User menu actions (FR-X-15) and the dialogs they open: Profile,
// Settings and Export lead to Settings (#profile, #export); Help and About open their dialogs; Sign out uses the shared
// flow (useSignOut). Each choice is logged. Dialogs opened from the menu return the focus to the menu's button.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Help → Text formatting opens the Markdown cheat sheet.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. "Install app" while the browser allows installing (D-55).
import { useNavigate } from "@tanstack/react-router";
import {
  CircleHelp,
  Download,
  Info,
  LogOut,
  MonitorSmartphone,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { FormattingHelpDialog } from "@/components/markdown/MarkdownEditor";
import { log } from "@/lib/log";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { useSignOut } from "@/lib/useSignOut";

import { AboutDialog, HelpDialog } from "./HelpAboutDialogs";

export interface MenuAction {
  id: "profile" | "settings" | "export" | "help" | "about" | "install" | "sign-out";
  label: string;
  icon: LucideIcon;
  run: () => void;
  /** Starts a new group (separator before it). */
  group?: boolean;
  /** Puts the focus on its target (a Settings section): the menu must not return it to the avatar. */
  movesFocus?: boolean;
  danger?: boolean;
}

/** The visible button that opens the user menu: the avatar in the rail, or the drawer button on phones (the first one,
 *  the avatar, when the layout is unknown). */
function focusMenuButton(): void {
  const buttons = [...document.querySelectorAll<HTMLElement>("[data-user-menu-button]")];
  (buttons.find((button) => button.getClientRects().length > 0) ?? buttons[0])?.focus();
}

/** Menu actions plus the dialogs they open (rendered once by the shell). */
export function useUserMenu(): { actions: MenuAction[]; dialogs: ReactNode } {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestSignOut, signOutDialog } = useSignOut(focusMenuButton);
  const { installable, install } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [formattingOpen, setFormattingOpen] = useState(false);

  const go = (id: MenuAction["id"], hash?: string) => () => {
    log.info("user_menu", { action: id });
    void navigate({ to: "/settings", ...(hash ? { hash } : {}) });
  };
  const actions: MenuAction[] = [
    { id: "profile", label: t("userMenu.profile"), icon: UserRound, run: go("profile", "profile"), movesFocus: true },
    { id: "settings", label: t("userMenu.settings"), icon: Settings, run: go("settings") },
    { id: "export", label: t("userMenu.export"), icon: Download, run: go("export", "export"), movesFocus: true },
    {
      id: "help",
      label: t("userMenu.help"),
      icon: CircleHelp,
      group: true,
      run: () => {
        log.info("user_menu", { action: "help" });
        setHelpOpen(true);
      },
    },
    {
      id: "about",
      label: t("userMenu.about"),
      icon: Info,
      run: () => {
        log.info("user_menu", { action: "about" });
        setAboutOpen(true);
      },
    },
    ...(installable
      ? [
          {
            id: "install" as const,
            label: t("userMenu.install"),
            icon: MonitorSmartphone,
            run: () => {
              log.info("user_menu", { action: "install" });
              void install();
            },
          },
        ]
      : []),
    {
      id: "sign-out",
      label: t("userMenu.signOut"),
      icon: LogOut,
      group: true,
      danger: true,
      run: () => {
        log.info("user_menu", { action: "sign-out" });
        requestSignOut();
      },
    },
  ];
  const dialogs = (
    <>
      <HelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        returnFocus={focusMenuButton}
        onFormatting={() => {
          log.info("user_menu", { action: "formatting_help" });
          setFormattingOpen(true);
        }}
      />
      <FormattingHelpDialog
        open={formattingOpen}
        onOpenChange={setFormattingOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusMenuButton();
        }}
      />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} returnFocus={focusMenuButton} />
      {signOutDialog}
    </>
  );
  return { actions, dialogs };
}
