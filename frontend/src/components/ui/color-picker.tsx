// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-042. Colour picker of the 8 palette colours (FR-X-13, D-47): native radio
// buttons (arrow keys, one Tab stop), every colour named for screen readers and in the tooltip, the chosen one marked
// with a check (not by colour alone). ColorSwatch is the plain sample used in menus and lists.
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { COLORS, DEFAULT_COLOR, swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

export function ColorSwatch({ color, className }: { color: Color; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-block size-3 shrink-0 rounded-full", swatchClasses(color), className)} />
  );
}

interface ColorPickerProps {
  value: Color | null | undefined;
  onChange: (color: Color) => void;
  name: string;
  disabled?: boolean;
}

export function ColorPicker({ value, onChange, name, disabled = false }: ColorPickerProps) {
  const { t } = useTranslation();
  const current = value ?? DEFAULT_COLOR;
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="mb-1 text-[13px] font-medium">{t("palette.title")}</legend>
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map((color) => {
          const label = t(`palette.colors.${color}`);
          const checked = current === color;
          return (
            <label
              key={color}
              title={label}
              className={cn(
                "relative grid size-8 cursor-pointer place-items-center rounded-full max-md:size-11",
                swatchClasses(color),
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary",
                checked && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={color}
                checked={checked}
                aria-label={label}
                onChange={() => {
                  onChange(color);
                }}
              />
              {/* The check sits on the page background, so it is visible on every colour in both themes. */}
              {checked ? (
                <span className="grid size-5 place-items-center rounded-full bg-bg text-fg">
                  <Check className="size-3.5" aria-hidden />
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
