// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Entry point: apply the theme before the first paint, configure the
// API client, mount providers.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. Install prompt is captured from the start; the service worker is
// registered in production builds (lib/pwa.ts).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import { log } from "@/lib/log";
import { prefetchOnDemandCode } from "@/lib/prefetch";
import { listenForInstall, registerServiceWorker } from "@/lib/pwa";
import { applyTheme, readPreference, resolveTheme } from "@/theme/theme";

import { App } from "./App";
import { createAppRouter, createQueryClient } from "./router";

applyTheme(resolveTheme(readPreference()));
listenForInstall();
registerServiceWorker();

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

// +++===+++ 2026-11-26 18:05 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). The code of the page being opened ("/" opens
// the calendar) starts loading now, while the session is checked: the router would ask for it only after /me answered.
for (const match of router.matchRoutes(window.location.pathname === "/" ? "/calendar" : window.location.pathname, {})) {
  const route = router.routesById[match.routeId];
  void router.loadRouteChunk(route)?.catch(() => undefined);
}

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing in index.html");

createRoot(container).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);
log.info("app_mounted", { mode: import.meta.env.MODE });
prefetchOnDemandCode();
