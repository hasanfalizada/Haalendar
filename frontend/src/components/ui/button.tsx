// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Button (shadcn/ui pattern) with Haalendar variants from the design system.
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm text-[13px] font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink hover:bg-primary-hover",
        secondary: "border border-line bg-bg text-fg hover:bg-surface",
        ghost: "text-fg hover:bg-surface",
        danger: "border border-line bg-bg text-danger hover:bg-surface",
      },
      size: {
        md: "h-8 px-3",
        icon: "size-10",
        touch: "h-11 px-3",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
