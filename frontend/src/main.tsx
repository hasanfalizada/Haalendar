// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Entry point: apply the theme before the first paint, configure the
// API client, mount providers.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Install prompt is captured from the start; the service worker is
// registered in production builds (lib/pwa.ts).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { log } from "@/lib/log";
import { listenForInstall, registerServiceWorker } from "@/lib/pwa";
import { applyTheme, readPreference, resolveTheme } from "@/theme/theme";

import { App } from "./App";
import { createAppRouter, createQueryClient } from "./router";

applyTheme(resolveTheme(readPreference()));
listenForInstall();
registerServiceWorker();

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing in index.html");

createRoot(container).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);
log.info("app_mounted", { mode: import.meta.env.MODE });
