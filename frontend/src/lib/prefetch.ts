// +++===+++ 2026-11-26 20:30 +04 — Hasan Alizada — HAAL-143 (D-128). The code loaded on demand (the search window and
// palette, the Markdown parser, "Convert to…", the Markdown editor's help) is fetched in the background once the page
// has loaded and the browser is idle: it stays out of the first paint, and a first session that loses the network
// before the service worker controls the page still has it (an import failed offline otherwise).
export function prefetchOnDemandCode(): void {
  const run = () => {
    void Promise.allSettled([
      import("@/components/search/SearchDialog"),
      import("@/lib/markdown-text"),
      import("@/components/convert/ConvertDialog"),
      import("@/components/markdown/MarkdownEditor"),
    ]);
  };
  const idle = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 2000);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}
