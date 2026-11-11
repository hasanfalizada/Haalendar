// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. i18n-ready (SRS 4.10): every UI string lives in locales/<lang>.json.
// v1.0 ships English only; adding a language = adding a JSON file and registering it here.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

export const defaultNS = "translation";
export const resources = { en: { translation: en } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS,
  interpolation: { escapeValue: false }, // React already escapes output
  returnNull: false,
});

export default i18n;
