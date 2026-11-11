// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. User menu in every module (FR-X-15): the avatar in the rail opens
// it as a dropdown; on phones the profile block in the drawer expands into the same items (actions: useUserMenu).
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. 44 px rail target on touch devices.
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { meQuery } from "@/api/session";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { MenuAction } from "./useUserMenu";

/** Rail: the avatar opens the menu as a dropdown. */
export function UserMenuButton({ actions }: { actions: MenuAction[] }) {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  // Closing the menu returns the focus to the avatar, unless the chosen entry moved it to its target.
  const focusMoved = useRef(false);
  if (!me?.display_name) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-user-menu-button
        aria-label={t("userMenu.open", { name: me.display_name })}
        title={me.display_name}
        className="mt-1 grid place-items-center rounded-full pointer-coarse:size-11"
      >
        <Avatar name={me.display_name} url={me.avatar_url} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={14}
        onCloseAutoFocus={(event) => {
          if (focusMoved.current) event.preventDefault();
          focusMoved.current = false;
        }}
      >
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={me.display_name} url={me.avatar_url} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{me.display_name}</span>
            <span className="block truncate text-xs text-muted">{me.email}</span>
          </span>
        </div>
        <DropdownMenuSeparator />
        {actions.map((action) => (
          <MenuEntry
            key={action.id}
            action={action}
            onChosen={() => {
              focusMoved.current = action.movesFocus ?? false;
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuEntry({ action, onChosen }: { action: MenuAction; onChosen: () => void }) {
  return (
    <>
      {action.group ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        danger={action.danger ?? false}
        onSelect={() => {
          onChosen();
          action.run();
        }}
      >
        <action.icon aria-hidden />
        {action.label}
      </DropdownMenuItem>
    </>
  );
}

/** Drawer (phones): the profile block expands into the menu items. */
export function UserMenuList({
  actions,
  onSelect,
}: {
  actions: MenuAction[];
  /** Called before the action runs (the drawer closes). */
  onSelect: (action: MenuAction) => void;
}) {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const [expanded, setExpanded] = useState(false);
  if (!me?.display_name) return null;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="drawer-user-menu"
        aria-label={t("userMenu.open", { name: me.display_name })}
        onClick={() => {
          setExpanded((value) => !value);
        }}
        className="flex items-center gap-3 rounded-sm p-2 text-left hover:bg-surface"
      >
        <Avatar name={me.display_name} url={me.avatar_url} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{me.display_name}</span>
          <span className="block truncate text-xs text-muted">{me.email}</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>
      {expanded ? (
        <ul id="drawer-user-menu" className="flex flex-col gap-0.5 pt-1">
          {actions.map((action) => (
            <li key={action.id} className={cn(action.group && "mt-1 border-t border-line pt-1")}>
              <button
                type="button"
                onClick={() => {
                  onSelect(action);
                  action.run();
                }}
                className={cn(
                  "flex h-11 w-full items-center gap-3 rounded-sm px-3 text-left font-medium hover:bg-surface",
                  action.danger ? "text-danger" : "text-fg",
                )}
              >
                <action.icon className="size-5" aria-hidden />
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
