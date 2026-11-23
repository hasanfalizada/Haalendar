// +++===+++ 2026-11-23 14:15 +04 — Hasan Alizada — HAAL-039 (D-119). The small search field of a header (the owner
// asked for a small search line that opens on a click while the page behind it is dimmed): it looks like a field and
// opens the search window, which takes the typing.
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { setSearchOpen } from "./searchOpen";

export function SearchField({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-search-field
      aria-haspopup="dialog"
      aria-keyshortcuts="/"
      onClick={() => {
        setSearchOpen(true);
      }}
      className={cn(
        "flex h-9 min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted",
        "hover:border-muted focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:h-11",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{t("search.open")}</span>
      <kbd aria-hidden className="rounded-sm border border-line px-1.5 font-sans text-xs leading-5 max-md:hidden">
        /
      </kbd>
    </button>
  );
}
