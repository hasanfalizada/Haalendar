// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Toast region for result notifications (lib/notify.ts): bottom right
// on desktop, bottom on phones, follows the app theme, labelled for screen readers. Toasts stay clickable while a
// modal dialog is open (pointer events are re-enabled for them in styles.css).
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";

import { useTheme } from "@/theme/ThemeProvider";

export function Notifications() {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      richColors
      visibleToasts={4}
      containerAriaLabel={t("notify.region")}
      toastOptions={{ closeButtonAriaLabel: t("common.close") }}
    />
  );
}
