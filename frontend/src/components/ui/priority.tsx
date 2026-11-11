// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. Priority UI (FR-X-12, D-46): a badge with icon and text (never colour
// alone), a Low / Medium / High picker made of native radio buttons (arrow keys work out of the box) and a filter of
// toggle buttons (several levels at once; none = everything). Lists show the badge only for high and low (`hideDefault`);
// details and editors show all three.
import { ChevronsDown, ChevronsUp, Equal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { normalize, PRIORITIES, type Priority } from "@/atoms/items/priority";
import { cn } from "@/lib/utils";

const ICON = { high: ChevronsUp, medium: Equal, low: ChevronsDown } as const;
const TONE: Record<Priority, string> = {
  high: "bg-danger/10 text-danger",
  medium: "bg-surface-2 text-fg",
  low: "bg-surface text-muted",
};

interface PriorityBadgeProps {
  priority: Priority | null | undefined;
  /** Icon only; the level stays readable for screen readers. */
  compact?: boolean;
  /** Lists: nothing for the default (medium). */
  hideDefault?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, compact = false, hideDefault = false, className }: PriorityBadgeProps) {
  const { t } = useTranslation();
  const level = normalize(priority);
  if (hideDefault && level === "medium") return null;
  const Icon = ICON[level];
  const label = t(`priority.levels.${level}`);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs font-medium",
        TONE[level],
        className,
      )}
      title={compact ? t("priority.label", { level: label }) : undefined}
    >
      <Icon className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">{t("priority.label", { level: label })}</span> : label}
    </span>
  );
}

interface PrioritySelectProps {
  value: Priority | null | undefined;
  onChange: (value: Priority) => void;
  name: string;
  disabled?: boolean;
}

export function PrioritySelect({ value, onChange, name, disabled = false }: PrioritySelectProps) {
  const { t } = useTranslation();
  const current = normalize(value);
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="mb-1 text-[13px] font-medium">{t("priority.title")}</legend>
      <div className="inline-flex w-fit rounded-sm border border-line p-0.5">
        {[...PRIORITIES].reverse().map((level) => {
          const Icon = ICON[level];
          const checked = current === level;
          return (
            <label
              key={level}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-1 rounded-sm px-2.5 text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary pointer-fine:md:h-8",
                checked ? TONE[level] : "text-muted hover:bg-surface",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={level}
                checked={checked}
                onChange={() => {
                  onChange(level);
                }}
              />
              <Icon className="size-4" aria-hidden />
              {t(`priority.levels.${level}`)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface PriorityFilterProps {
  value: readonly Priority[];
  onChange: (value: Priority[]) => void;
}

export function PriorityFilter({ value, onChange }: PriorityFilterProps) {
  const { t } = useTranslation();
  const selected = new Set(value);
  return (
    <div role="group" aria-label={t("priority.filter")} className="inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        aria-pressed={selected.size === 0}
        className={cn(
          "h-11 rounded-sm px-2.5 text-[13px] pointer-fine:md:h-8",
          selected.size === 0 ? "bg-primary-tint text-primary" : "text-muted hover:bg-surface",
        )}
        onClick={() => {
          onChange([]);
        }}
      >
        {t("priority.all")}
      </button>
      {PRIORITIES.map((level) => {
        const Icon = ICON[level];
        const on = selected.has(level);
        return (
          <button
            key={level}
            type="button"
            aria-pressed={on}
            className={cn(
              "inline-flex h-11 items-center gap-1 rounded-sm px-2.5 text-[13px] pointer-fine:md:h-8",
              on ? TONE[level] : "text-muted hover:bg-surface",
            )}
            onClick={() => {
              onChange(PRIORITIES.filter((p) => (p === level ? !on : selected.has(p))));
            }}
          >
            <Icon className="size-4" aria-hidden />
            {t(`priority.levels.${level}`)}
          </button>
        );
      })}
    </div>
  );
}
