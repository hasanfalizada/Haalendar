// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Placeholder page per module: header + empty state (design system 7,
// "an invitation, not an apology"). Each module replaces it with its real view in later tasks.
import type { LucideIcon } from "lucide-react";

interface EmptyPageProps {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  icon: LucideIcon;
}

export function EmptyPage({ title, emptyTitle, emptyBody, icon: Icon }: EmptyPageProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-2">
          <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
            <Icon className="size-6" aria-hidden />
          </div>
          <h2 className="text-[15px] font-semibold">{emptyTitle}</h2>
          <p className="text-muted">{emptyBody}</p>
        </div>
      </div>
    </div>
  );
}
