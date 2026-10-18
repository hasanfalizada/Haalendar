// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. Bulk action bar for a selection (FR-X-07, wireframe D9): "N selected
// of M shown", select all / clear, and the actions the selected rows support — delete, restore, color, priority, move
// to next day. A list shows only the actions its rows support (`actions`); color and priority open a small menu.
// Sticks to the bottom on phones so it stays reachable with a thumb.
// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-041. The priority menu shows the priority badges (atom order).
import { CalendarArrowUp, Palette, RotateCcw, Signal, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { PRIORITIES, type Priority } from "@/atoms/items/priority";
import type { BulkAction } from "@/lib/bulk";
import type { Selection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";

import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { PriorityBadge } from "./priority";

const COLORS: readonly Color[] = ["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"];
// Full class names so Tailwind finds them.
const SWATCH: Record<Color, string> = {
  red: "bg-ev-red",
  orange: "bg-ev-orange",
  yellow: "bg-ev-yellow",
  green: "bg-ev-green",
  blue: "bg-ev-blue",
  purple: "bg-ev-purple",
  brown: "bg-ev-brown",
  black: "bg-ev-black",
};

interface BulkBarProps {
  selection: Selection;
  /** Rows shown (loaded) in the list. */
  total: number;
  actions: readonly BulkAction[];
  busy?: boolean;
  onAction: (action: BulkAction, value?: Color | Priority) => void;
  className?: string;
}

function SelectAllBox({ selection, label }: { selection: Selection; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const indeterminate = selection.count > 0 && !selection.allSelected;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className="size-4"
      checked={selection.allSelected}
      onChange={() => {
        if (selection.allSelected) selection.clear();
        else selection.selectAll();
      }}
    />
  );
}

export function BulkBar({ selection, total, actions, busy = false, onAction, className }: BulkBarProps) {
  const { t } = useTranslation();
  const some = selection.count > 0;
  const has = (action: BulkAction) => actions.includes(action);
  return (
    <div
      role="toolbar"
      aria-label={t("bulk.toolbar")}
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-2 border-b border-line bg-bg py-1.5",
        some && "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:border-t max-md:shadow-md",
        className,
      )}
    >
      <SelectAllBox selection={selection} label={t("bulk.selectAll")} />
      {some ? (
        <>
          <span className="text-[13px]" aria-live="polite">
            {t("bulk.selected", { count: selection.count, total })}
          </span>
          {has("restore") ? (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => {
                onAction("restore");
              }}
            >
              <RotateCcw aria-hidden />
              {t("bulk.restore")}
            </Button>
          ) : null}
          {has("set_color") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={busy}>
                  <Palette aria-hidden />
                  {t("bulk.color")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {COLORS.map((color) => (
                  <DropdownMenuItem
                    key={color}
                    onSelect={() => {
                      onAction("set_color", color);
                    }}
                  >
                    <span aria-hidden className={cn("size-3 rounded-full", SWATCH[color])} />
                    {t(`bulk.colors.${color}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {has("set_priority") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={busy}>
                  <Signal aria-hidden />
                  {t("bulk.priority")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PRIORITIES.map((priority) => (
                  <DropdownMenuItem
                    key={priority}
                    onSelect={() => {
                      onAction("set_priority", priority);
                    }}
                  >
                    <PriorityBadge priority={priority} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {has("move_next_day") ? (
            <Button
              disabled={busy}
              onClick={() => {
                onAction("move_next_day");
              }}
            >
              <CalendarArrowUp aria-hidden />
              {t("bulk.moveNextDay")}
            </Button>
          ) : null}
          {has("delete") ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                onAction("delete");
              }}
            >
              <Trash2 aria-hidden />
              {t("bulk.delete")}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={selection.clear} aria-label={t("bulk.clear")}>
            <X aria-hidden />
            <span className="max-md:sr-only">{t("bulk.clear")}</span>
          </Button>
        </>
      ) : (
        <span className="text-[13px] text-muted">{t("bulk.hint")}</span>
      )}
    </div>
  );
}
