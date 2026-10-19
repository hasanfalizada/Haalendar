// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Settings placeholder with the theme switch (FR-X-16). Full user
// settings (week start, Week A/B, …) arrive in HAAL-045.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Account section: who is signed in, sign out (wipes cached data).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. The account section became the profile section (incl. sign-out).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Sharing overview (shared by me / with me).
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Security section (password, 2FA, sessions).
// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. "Your data": export archives (#export).
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. Every navigation here (user menu: Profile, Settings, Export) shows
// its target: #profile / #export are scrolled to and focused, without a hash the page scrolls back to the top — also
// when Settings is already open.
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { ExportSection } from "@/components/exports/ExportSection";
import { ProfileSection } from "@/components/profile/ProfileSection";
import { SecuritySection } from "@/components/security/SecuritySection";
import { SharingSection } from "@/components/sharing/SharingSection";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemePreference } from "@/theme/theme";

const OPTIONS: { value: ThemePreference; labelKey: `pages.settings.theme${"System" | "Light" | "Dark"}` }[] = [
  { value: "system", labelKey: "pages.settings.themeSystem" },
  { value: "light", labelKey: "pages.settings.themeLight" },
  { value: "dark", labelKey: "pages.settings.themeDark" },
];

/** Brings the section named by the URL hash into view and focus on every navigation (a new history entry). */
function useSectionTarget() {
  const target = useRouterState({
    select: (state) => `${state.location.state.__TSR_key ?? ""}#${state.location.hash}`,
  });
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hash = target.slice(target.indexOf("#") + 1);
    const section = hash ? document.getElementById(hash) : null;
    if (section) {
      section.scrollIntoView({ block: "start" });
      section.focus({ preventScroll: true });
    } else {
      top.current?.scrollIntoView({ block: "start" });
    }
  }, [target]);
  return top;
}

function SettingsPage() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const top = useSectionTarget();
  return (
    <div ref={top} className="flex flex-col">
      <div className="border-b border-line px-4 py-2.5">
        <h1 className="text-lg font-semibold">{t("pages.settings.title")}</h1>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <span id="theme-label" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {t("pages.settings.theme")}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="theme-label"
          className="inline-flex w-fit overflow-hidden rounded-sm border border-line"
        >
          {OPTIONS.map((option) => {
            const checked = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  setPreference(option.value);
                }}
                className={cn(
                  "h-11 border-r border-line px-4 text-[13px] last:border-r-0 md:h-8",
                  checked ? "bg-primary-tint font-semibold text-primary" : "hover:bg-surface",
                )}
              >
                {t(option.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <ProfileSection />
      <SecuritySection />
      <SharingSection />
      <ExportSection />
    </div>
  );
}

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });
