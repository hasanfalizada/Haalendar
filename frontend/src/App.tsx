// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Provider tree shared by the app and the tests.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Re-authentication dialog provider for sensitive actions.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Result notifications region and the guard against closing the tab
// while a write is still in flight.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo handlers are registered at start-up, so steps restored from the
// tab's history after a reload find them.
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";

import "@/api/client";
import "@/i18n";
import { installUnloadGuard } from "@/api/write";
import { ReauthProvider } from "@/components/auth/ReauthProvider";
import "@/components/sharing/undo-sharing";
import { Notifications } from "@/components/ui/notifications";
import { ThemeProvider } from "@/theme/ThemeProvider";

import type { createAppRouter } from "./router";

interface AppProps {
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
}

export function App({ queryClient, router }: AppProps) {
  useEffect(() => installUnloadGuard(), []);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ReauthProvider>
          <RouterProvider router={router} />
        </ReauthProvider>
      </QueryClientProvider>
      <Notifications />
    </ThemeProvider>
  );
}
