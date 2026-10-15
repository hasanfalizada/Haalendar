// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Provider tree shared by the app and the tests.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Re-authentication dialog provider for sensitive actions.
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import "@/api/client";
import "@/i18n";
import { ReauthProvider } from "@/components/auth/ReauthProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";

import type { createAppRouter } from "./router";

interface AppProps {
  queryClient: QueryClient;
  router: ReturnType<typeof createAppRouter>;
}

export function App({ queryClient, router }: AppProps) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ReauthProvider>
          <RouterProvider router={router} />
        </ReauthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
