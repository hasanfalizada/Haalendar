// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Provider tree shared by the app and the tests.
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import "@/api/client";
import "@/i18n";
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
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
