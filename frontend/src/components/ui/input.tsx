// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Text input, select and field wrapper (shadcn/ui pattern, design system
// form styles): label above, hint/error below, error wired to aria-invalid + aria-describedby.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. 44 px high and 16 px text on touch and narrow screens (16 px stops iOS Safari from zooming into a focused
// field); the compact 36 px / 13 px only with a mouse from 768 px.
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const controlClass =
  "h-11 w-full rounded-sm border border-line bg-bg px-2.5 text-base text-fg placeholder:text-muted disabled:opacity-50 aria-invalid:border-danger pointer-fine:md:h-9 pointer-fine:md:text-[13px]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: (aria: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}

/** Renders label + control + hint/error; the render prop receives the ids the control must carry. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      {hint ? (
        <div id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
