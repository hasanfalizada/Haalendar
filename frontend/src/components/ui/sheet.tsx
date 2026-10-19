// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Side sheet on Radix Dialog: focus trap, Esc to close, scroll lock,
// focus returns to the trigger. Used for the mobile navigation drawer (D-10) and later for mobile editors.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. Scrolls when its content is taller than the screen (the drawer with
// the user menu expanded on short phones).
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

interface SheetContentProps extends ComponentProps<typeof Dialog.Content> {
  title: string;
  closeLabel: string;
  children: ReactNode;
}

export function SheetContent({ title, closeLabel, className, children, ...props }: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-fg/40 data-[state=open]:animate-in" />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col gap-3 overflow-y-auto bg-bg p-4 shadow-xl",
          "pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
          className,
        )}
        aria-describedby={undefined}
        {...props}
      >
        <div className="flex items-center justify-between">
          <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
          <Dialog.Close
            className="inline-flex size-11 items-center justify-center rounded-sm text-muted hover:bg-surface"
            aria-label={closeLabel}
          >
            <X className="size-5" aria-hidden />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
