// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Settings placeholder with the theme switch (FR-X-16). Full user
// settings (week start, Week A/B, …) arrive in HAAL-045.
// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Account section: who is signed in, sign out (wipes cached data).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { meQuery, signOut } from "@/api/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemePreference } from "@/theme/theme";

const OPTIONS: { value: ThemePreference; labelKey: `pages.settings.theme${"System" | "Light" | "Dark"}` }[] = [
  { value: "system", labelKey: "pages.settings.themeSystem" },
  { value: "light", labelKey: "pages.settings.themeLight" },
  { value: "dark", labelKey: "pages.settings.themeDark" },
];

function SettingsPage() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useQuery(meQuery);
  return (
    <div className="flex flex-col">
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
      <div className="flex flex-col gap-2 border-t border-line p-4">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
          {t("pages.settings.account")}
        </span>
        {me ? <p>{t("pages.settings.signedInAs", { email: me.email })}</p> : null}
        <Button
          className="w-fit"
          onClick={() => {
            void signOut(queryClient).then(() => navigate({ to: "/login", replace: true }));
          }}
        >
          {t("auth.signOut")}
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });
