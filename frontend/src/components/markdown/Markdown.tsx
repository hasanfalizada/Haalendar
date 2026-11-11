// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Shows a Markdown source (FR-X-20, D-51). The renderer is a separate
// chunk loaded the first time Markdown is shown; until then the text appears as it was written (line breaks kept), so
// nothing jumps and nothing is ever interpreted.
import { lazy, Suspense } from "react";

import { cn } from "@/lib/utils";

const MarkdownView = lazy(() => import("./MarkdownView"));

export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <Suspense fallback={<div className={cn("markdown whitespace-pre-wrap", className)}>{source}</div>}>
      <MarkdownView source={source} {...(className ? { className } : {})} />
    </Suspense>
  );
}
