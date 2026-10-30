// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-118. The board filters (FR-KAN-09, D-96) under the board's header: a text
// search, the board's labels (a menu of checkboxes), priority and due date (toggle buttons: overdue, today, this week,
// none) and Clear filters. On phones they fold behind "Filters (n)". Nothing is written: the page keeps them in the
// address.
import { Filter, Search, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PriorityFilter } from "@/components/ui/priority";
import { type BoardFilter, DUE_FILTERS, NO_FILTER, filterCount } from "@/lib/boardFilter";
import { swatchClasses } from "@/lib/palette";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;

interface BoardFiltersProps {
  filter: BoardFilter;
  /** The board's live labels, by name. */
  labels: readonly Row[];
  onChange: (next: BoardFilter) => void;
}

export function BoardFilters({ filter, labels, onChange }: BoardFiltersProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const count = filterCount(filter);
  const set = (patch: Partial<BoardFilter>) => {
    onChange({ ...filter, ...patch });
  };

  return (
    <div className="border-b border-line px-2 py-1.5 md:px-4">
      <Button
        className="md:hidden"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Filter aria-hidden />
        {count > 0 ? t("kanban.filters.toggleCount", { count }) : t("kanban.filters.toggle")}
      </Button>
      <div
        role="search"
        aria-label={t("kanban.filters.title")}
        className={cn("flex-wrap items-center gap-2 max-md:mt-2", open ? "flex" : "hidden md:flex")}
      >
        <div className="relative w-full md:w-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            aria-label={t("kanban.filters.search")}
            placeholder={t("kanban.filters.search")}
            className="pl-8"
            maxLength={200}
            value={filter.text}
            onChange={(e) => {
              set({ text: e.target.value });
            }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              {filter.labels.length > 0
                ? t("kanban.filters.labelsCount", { count: filter.labels.length })
                : t("kanban.filters.labels")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {labels.length === 0 ? (
              <DropdownMenuItem disabled>{t("kanban.labels.none")}</DropdownMenuItem>
            ) : (
              labels.map((label) => {
                const id = String(label.id);
                const on = filter.labels.includes(id);
                return (
                  <DropdownMenuCheckboxItem
                    key={id}
                    checked={on}
                    onCheckedChange={(checked) => {
                      set({
                        labels: checked ? [...filter.labels, id] : filter.labels.filter((other) => other !== id),
                      });
                    }}
                  >
                    <span className={cn("size-2.5 rounded-full", swatchClasses(label.color as Color))} aria-hidden />
                    {String(label.name)}
                  </DropdownMenuCheckboxItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <PriorityFilter
          value={filter.priorities}
          onChange={(priorities) => {
            set({ priorities });
          }}
        />
        <div role="group" aria-label={t("kanban.filters.due")} className="inline-flex flex-wrap items-center gap-1">
          {DUE_FILTERS.map((kind) => {
            const on = filter.due.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                className={cn(
                  "h-11 rounded-sm px-2.5 text-[13px] pointer-fine:md:h-8",
                  on ? "bg-primary-tint text-primary" : "text-muted hover:bg-surface",
                )}
                onClick={() => {
                  set({ due: on ? filter.due.filter((other) => other !== kind) : [...filter.due, kind] });
                }}
              >
                {t(`kanban.filters.dueKinds.${kind}`)}
              </button>
            );
          })}
        </div>
        {count > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              onChange(NO_FILTER);
            }}
          >
            <X aria-hidden />
            {t("kanban.filters.clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
