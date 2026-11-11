// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Popover on Radix (Esc, outside click, focus return to the trigger),
// used by the notification center in the rail.
import { Popover as RadixPopover } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({ className, ...props }: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={14}
        className={cn("z-50 rounded-md border border-line bg-bg shadow-lg outline-none", className)}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
