// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Dropdown menu on Radix (roving focus, typeahead, Esc). Used for row
// actions; items are at least 44 px high on touch screens.
import { DropdownMenu as RadixMenu } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;

export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align="end"
        sideOffset={4}
        className={cn("z-50 min-w-48 rounded-sm border border-line bg-bg p-1 shadow-lg", className)}
        {...props}
      />
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger = false,
  ...props
}: ComponentProps<typeof RadixMenu.Item> & { danger?: boolean }) {
  return (
    <RadixMenu.Item
      className={cn(
        "flex h-11 cursor-default items-center gap-2 rounded-sm px-2.5 text-[13px] outline-none select-none md:h-8",
        "data-[highlighted]:bg-surface data-[disabled]:opacity-50 [&_svg]:size-4",
        danger ? "text-danger" : "text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-line" />;
}
