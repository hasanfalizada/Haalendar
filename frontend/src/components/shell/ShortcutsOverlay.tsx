// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Shortcut overlay (FR-X-08): "?" or the keyboard button opens a list
// of the shortcuts that work on the current page, grouped, with key caps for this platform (⌘ on Apple devices). The
// list comes from the shortcut registry, so it never shows a key that does nothing. Also registers F6 / Shift+F6,
// which move the focus between the regions of the page (navigation, content, notifications).
import { Keyboard } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { keyCaps, type ShortcutGroup, useRegisteredShortcuts, useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const GROUPS: readonly ShortcutGroup[] = ["navigation", "items", "editing", "general"];

/** Visible regions in page order; the notification region only while it shows something. */
function regions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[data-region]")].filter(
    (el) => el.getClientRects().length > 0 && (el.dataset.region !== "notifications" || el.querySelector("li")),
  );
}

function focusRegion(step: 1 | -1): void {
  const all = regions();
  if (all.length === 0) return;
  const at = all.findIndex((el) => el.contains(document.activeElement));
  const next = all[(at + step + all.length) % all.length];
  next?.focus();
}

export function ShortcutsOverlay({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const shortcuts = useRegisteredShortcuts();
  // Labels come from the registry as data, so their keys are only known at run time.
  const translate = t as unknown as (key: string, values?: Record<string, string>) => string;

  useShortcut({
    id: "shortcuts-overlay",
    keys: ["?"],
    group: "general",
    label: "shortcuts.overlay",
    handler: () => {
      setOpen(true);
    },
  });
  useShortcut({
    id: "region-next",
    keys: ["F6"],
    group: "navigation",
    label: "shortcuts.regionNext",
    allowInFields: true,
    handler: () => {
      focusRegion(1);
    },
  });
  useShortcut({
    id: "region-previous",
    keys: ["Shift+F6"],
    group: "navigation",
    label: "shortcuts.regionPrevious",
    allowInFields: true,
    handler: () => {
      focusRegion(-1);
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("shortcuts.title")}
        title={`${t("shortcuts.title")} (?)`}
        className={cn("text-muted", className)}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Keyboard className="size-5" aria-hidden />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={t("shortcuts.title")}
          description={t("shortcuts.hint")}
          closeLabel={t("common.close")}
          className="md:max-w-lg"
        >
          <div className="flex flex-col gap-4">
            {GROUPS.map((group) => {
              const items = shortcuts.filter((s) => s.group === group);
              if (items.length === 0) return null;
              return (
                <section key={group} aria-labelledby={`shortcuts-${group}`}>
                  <h3
                    id={`shortcuts-${group}`}
                    className="mb-1 text-[11px] font-semibold tracking-wider text-muted uppercase"
                  >
                    {t(`shortcuts.groups.${group}`)}
                  </h3>
                  <dl className="flex flex-col divide-y divide-line">
                    {items.map((item) => {
                      const values = Object.fromEntries(
                        Object.entries(item.labelValues ?? {}).map(([k, v]) => [k, translate(v)]),
                      );
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                          <dt>{translate(item.label, values)}</dt>
                          <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                            {item.keys.map((keys, index) => (
                              <span key={keys} className="flex items-center gap-1">
                                {index > 0 ? <span className="text-xs text-muted">{t("shortcuts.or")}</span> : null}
                                {keyCaps(keys).map((cap) => (
                                  <kbd
                                    key={cap}
                                    className="min-w-6 rounded-sm border border-line bg-surface px-1.5 py-0.5 text-center font-sans text-xs"
                                  >
                                    {cap}
                                  </kbd>
                                ))}
                              </span>
                            ))}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
