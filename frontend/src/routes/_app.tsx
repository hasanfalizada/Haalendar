// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-163. Pathless layout: every module page lives inside the application shell;
// full-screen pages (setup, later sign-in) sit next to it at the root. The shell is needed by every module page, so it is
// kept in the entry bundle (no code split) instead of costing an extra request before each first paint.
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/shell/AppShell";

export const Route = createFileRoute("/_app")({ component: AppShell, codeSplitGroupings: [] });
