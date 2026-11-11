// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Type-safe translation keys: t("nav.calendar") is checked at compile time.
import "i18next";

import type en from "./locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}
