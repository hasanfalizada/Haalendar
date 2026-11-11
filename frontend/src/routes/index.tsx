// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. "/" opens the Calendar module (legacy behaviour: the app starts on today).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/calendar", replace: true });
  },
});
