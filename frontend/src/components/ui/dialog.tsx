// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Modal dialog on Radix Dialog (focus trap, Esc, scroll lock, focus
// return). Centered card on desktop, bottom sheet on phones (design system: dialogs).
import { Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogClose = RadixDialog.Close;

interface DialogContentProps {
  title: string;
  description?: ReactNode;
  closeLabel: string;
  children?: ReactNode;
  className?: string;
}

export function DialogContent({ title, description, closeLabel, children, className }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/40" />
      <RadixDialog.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-bg p-5 shadow-xl",
          "inset-x-0 bottom-0 max-h-[90dvh] overflow-auto rounded-t-md pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          "md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-md",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="text-[15px] font-semibold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-[13px] text-muted">{description}</RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close
            className="-m-2 inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface"
            aria-label={closeLabel}
          >
            <X className="size-5" aria-hidden />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">{children}</div>;
}
