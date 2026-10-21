// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. Help and About dialogs of the user menu (FR-X-15, legacy F-34).
// Help: shortcut overlay, documentation, issue tracker. About: version, licence, the author's and repository links.
// External links open in a new tab without access to this page (rel="noopener noreferrer"). Closing returns the focus
// through returnFocus (the user menu's button).
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Help offers "Text formatting" (the Markdown cheat sheet).
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. Links are at least 44 px high (touch).
import { ExternalLink, Keyboard, Type } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { APP_VERSION, AUTHOR_URL, DOCS_URL, ISSUES_URL, LICENSE_NAME, LICENSE_URL, REPOSITORY_URL } from "@/lib/about";
import { openShortcutsOverlay } from "@/lib/shortcutsOverlay";

const LOGO_SRC = "/icon.svg";

function OutLink({ href, children, hint }: { href: string; children: ReactNode; hint?: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-start gap-3 rounded-sm p-2 hover:bg-surface"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-medium text-primary">
          {children}
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">{t("help.newTab")}</span>
        </span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </a>
  );
}

interface MenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void;
}

function closeFocus(returnFocus: () => void) {
  return (event: Event) => {
    event.preventDefault();
    returnFocus();
  };
}

export function HelpDialog({
  open,
  onOpenChange,
  returnFocus,
  onFormatting,
}: MenuDialogProps & { onFormatting: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("help.title")}
        description={t("help.intro")}
        closeLabel={t("common.close")}
        onCloseAutoFocus={closeFocus(returnFocus)}
      >
        <div className="flex flex-col gap-1 text-[13px]">
          <button
            type="button"
            className="flex items-start gap-3 rounded-sm p-2 text-left hover:bg-surface"
            onClick={() => {
              onOpenChange(false);
              openShortcutsOverlay(returnFocus);
            }}
          >
            <Keyboard className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t("help.shortcuts")}</span>
              <span className="block text-xs text-muted">{t("help.shortcutsHint")}</span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-start gap-3 rounded-sm p-2 text-left hover:bg-surface"
            onClick={() => {
              onOpenChange(false);
              onFormatting();
            }}
          >
            <Type className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t("help.formatting")}</span>
              <span className="block text-xs text-muted">{t("help.formattingHint")}</span>
            </span>
          </button>
          <OutLink href={DOCS_URL} hint={t("help.docsHint")}>
            {t("help.docs")}
          </OutLink>
          <OutLink href={ISSUES_URL} hint={t("help.issuesHint")}>
            {t("help.issues")}
          </OutLink>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AboutDialog({ open, onOpenChange, returnFocus }: MenuDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("about.title")} closeLabel={t("common.close")} onCloseAutoFocus={closeFocus(returnFocus)}>
        <div className="flex items-center gap-3">
          <img src={LOGO_SRC} alt="" width={40} height={40} className="size-10" />
          <div>
            <p className="text-[15px] font-semibold">{t("app.name")}</p>
            <p className="text-xs text-muted">{t("about.version", { version: APP_VERSION })}</p>
          </div>
        </div>
        <p className="text-[13px]">{t("about.free")}</p>
        <p className="text-[13px] text-muted">{t("about.license", { name: LICENSE_NAME })}</p>
        <div className="flex flex-col gap-1 text-[13px]">
          <OutLink href={AUTHOR_URL}>{t("about.author")}</OutLink>
          <OutLink href={REPOSITORY_URL}>{t("about.repository")}</OutLink>
          <OutLink href={LICENSE_URL}>{t("about.licenseText")}</OutLink>
        </div>
      </DialogContent>
    </Dialog>
  );
}
