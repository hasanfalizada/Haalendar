// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Trash placeholder; unified trash arrives in HAAL-033.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. The unified trash.
import { createFileRoute } from "@tanstack/react-router";

import { TrashPage } from "@/components/trash/TrashPage";

export const Route = createFileRoute("/_app/trash")({ component: TrashPage });
