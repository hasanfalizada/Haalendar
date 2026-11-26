// +++===+++ 2026-11-26 18:15 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). "Convert to…" is a chunk of its own, loaded
// the first time it opens: the calendar, To-Do and board pages do not load it with their first screen.
import { type ComponentProps, lazy, Suspense } from "react";

import type { ConvertDialog as Dialog } from "./ConvertDialog";

const Lazy = lazy(() => import("./ConvertDialog").then((module) => ({ default: module.ConvertDialog })));

export function ConvertDialog(props: ComponentProps<typeof Dialog>) {
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
}
