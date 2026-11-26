// +++===+++ 2026-11-26 16:25 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). The formatting help of the user menu comes
// with the Markdown editor: a chunk loaded the first time it opens (inside Suspense), not part of the start bundle.
import { lazy } from "react";

export const FormattingHelpDialog = lazy(() =>
  import("./MarkdownEditor").then((module) => ({ default: module.FormattingHelpDialog })),
);
