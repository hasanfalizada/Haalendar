// +++===+++ 2026-11-24 11:40 +04 — Hasan Alizada — HAAL-046 (D-120). The filters of the search window, a row under the
// field (FR-X-19): Module, Dates (today, this week, this month, the next 30 days or a range of one's own), Calendar,
// Colour, Priority and Label as menus of checkboxes, and Reset. A button with a choice shows it ("Colour · 2"). On
// phones the row scrolls sideways.
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { PRIORITIES } from "@/atoms/items/priority";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLORS, swatchClasses } from "@/lib/palette";
import { fold, type SearchModule } from "@/lib/search";
import {
  DATE_PRESETS,
  type DatePreset,
  filterActive,
  NO_FILTER,
  presetRange,
  SEARCH_MODULES,
  type SearchFilter,
} from "@/lib/searchFilter";
import { cn } from "@/lib/utils";

interface Choice {
  value: string;
  label: ReactNode;
}

interface SearchFiltersProps {
  filter: SearchFilter;
  onChange: (next: SearchFilter) => void;
  /** The calendars the views show, by name. */
  calendars: readonly { id: string; name: string }[];
  /** Label names (notes' and boards'), one each. */
  labels: readonly string[];
  today: string;
  weekStart: number;
}

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list, value] : list.filter((other) => other !== value);
}

const triggerClass = (on: boolean) =>
  cn(
    "inline-flex h-11 shrink-0 items-center gap-1 rounded-sm border px-2 text-[13px] whitespace-nowrap pointer-fine:md:h-8",
    on ? "border-primary bg-primary-tint text-primary" : "border-line text-fg hover:bg-surface",
  );

function Menu({
  label,
  count,
  choices,
  selected,
  onToggle,
  empty,
}: {
  label: string;
  count: number;
  choices: readonly Choice[];
  selected: readonly string[];
  onToggle: (value: string, on: boolean) => void;
  empty: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass(count > 0)}>
        {count > 0 ? `${label} · ${String(count)}` : label}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {choices.length === 0 ? (
          <DropdownMenuItem disabled>{empty}</DropdownMenuItem>
        ) : (
          choices.map((choice) => (
            <DropdownMenuCheckboxItem
              key={choice.value}
              checked={selected.includes(choice.value)}
              onCheckedChange={(checked) => {
                onToggle(choice.value, checked);
              }}
            >
              {choice.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SearchFilters({ filter, onChange, calendars, labels, today, weekStart }: SearchFiltersProps) {
  const { t, i18n } = useTranslation();
  const [custom, setCustom] = useState(false);
  const set = (patch: Partial<SearchFilter>) => {
    onChange({ ...filter, ...patch });
  };
  const preset = DATE_PRESETS.find((name) => {
    const range = presetRange(name, today, weekStart);
    return filter.from === range.from && filter.to === range.to;
  });
  const dated = filter.from !== null || filter.to !== null;
  const short = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      Date.parse(`${date}T00:00:00Z`),
    );
  const datesLabel = preset
    ? t(`search.filters.presets.${preset}`)
    : dated
      ? `${short(filter.from ?? filter.to ?? today)} – ${short(filter.to ?? filter.from ?? today)}`
      : t("search.filters.dates");
  const choosePreset = (name: DatePreset | null) => {
    setCustom(false);
    set(name ? presetRange(name, today, weekStart) : { from: null, to: null });
  };

  return (
    <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
      <div role="group" aria-label={t("search.filters.label")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        <Menu
          label={t("search.filters.module")}
          count={filter.modules.length}
          choices={SEARCH_MODULES.map((module) => ({ value: module, label: t(`search.groups.${module}`) }))}
          selected={filter.modules}
          onToggle={(value, on) => {
            set({ modules: toggle(filter.modules, value as SearchModule, on) });
          }}
          empty=""
        />
        <DropdownMenu>
          <DropdownMenuTrigger className={triggerClass(dated)}>
            {datesLabel}
            <ChevronDown className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuCheckboxItem
              checked={!dated}
              onCheckedChange={() => {
                choosePreset(null);
              }}
            >
              {t("search.filters.anyTime")}
            </DropdownMenuCheckboxItem>
            {DATE_PRESETS.map((name) => (
              <DropdownMenuCheckboxItem
                key={name}
                checked={preset === name}
                onCheckedChange={() => {
                  choosePreset(name);
                }}
              >
                {t(`search.filters.presets.${name}`)}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setCustom(true);
                if (!dated) set({ from: today, to: today });
              }}
            >
              {t("search.filters.custom")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Menu
          label={t("search.filters.calendar")}
          count={filter.calendars.length}
          choices={calendars.map((calendar) => ({ value: calendar.id, label: calendar.name }))}
          selected={filter.calendars}
          onToggle={(value, on) => {
            set({ calendars: toggle(filter.calendars, value, on) });
          }}
          empty={t("search.filters.noCalendars")}
        />
        <Menu
          label={t("search.filters.colour")}
          count={filter.colors.length}
          choices={COLORS.map((color) => ({
            value: color,
            label: (
              <>
                <span className={cn("size-3 rounded-full", swatchClasses(color))} aria-hidden />
                {t(`palette.colors.${color}`)}
              </>
            ),
          }))}
          selected={filter.colors}
          onToggle={(value, on) => {
            set({ colors: toggle(filter.colors, value as Color, on) });
          }}
          empty=""
        />
        <Menu
          label={t("search.filters.priority")}
          count={filter.priorities.length}
          choices={PRIORITIES.map((level) => ({ value: level, label: t(`priority.levels.${level}`) }))}
          selected={filter.priorities}
          onToggle={(value, on) => {
            set({ priorities: toggle(filter.priorities, value as (typeof PRIORITIES)[number], on) });
          }}
          empty=""
        />
        <Menu
          label={t("search.filters.labels")}
          count={filter.labels.length}
          choices={labels.map((name) => ({ value: fold(name), label: name }))}
          selected={filter.labels}
          onToggle={(value, on) => {
            set({ labels: toggle(filter.labels, value, on) });
          }}
          empty={t("search.filters.noLabels")}
        />
        {filterActive(filter) ? (
          <button
            type="button"
            className="h-11 shrink-0 rounded-sm px-2.5 text-[13px] whitespace-nowrap text-primary hover:bg-surface pointer-fine:md:h-8"
            onClick={() => {
              setCustom(false);
              onChange(NO_FILTER);
            }}
          >
            {t("search.filters.reset")}
          </button>
        ) : null}
      </div>
      {custom && dated ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-1.5">
            {t("search.filters.from")}
            <input
              type="date"
              value={filter.from ?? ""}
              onChange={(event) => {
                set({ from: event.target.value || null });
              }}
              className="h-9 rounded-sm border border-line bg-bg px-2"
            />
          </label>
          <label className="flex items-center gap-1.5">
            {t("search.filters.to")}
            <input
              type="date"
              value={filter.to ?? ""}
              onChange={(event) => {
                set({ to: event.target.value || null });
              }}
              className="h-9 rounded-sm border border-line bg-bg px-2"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
