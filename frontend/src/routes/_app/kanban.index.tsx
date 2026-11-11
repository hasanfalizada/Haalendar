// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Kanban module placeholder; boards arrive in HAAL-110.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. The boards (D-90); one board opens at /kanban/<id>.
import { createFileRoute } from "@tanstack/react-router";

import { BoardsPage } from "@/components/kanban/BoardsPage";

export const Route = createFileRoute("/_app/kanban/")({ component: BoardsPage });
