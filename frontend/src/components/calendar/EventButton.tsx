// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. An event in the week and month grids (taken out of the week view,
// HAAL-087): a button named "Details of <title>" that opens the details card — a popover next to it on tablets and
// desktops, the page's sheet on phones; right-click opens it too (the browser menu is suppressed).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Also the agenda's rows; the description is optional there.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DayEntry } from "@/lib/dayView";

/** What every grid passes on from the page: which card is open and how to show it. */
export interface DetailsAnchor {
  /** The entry whose details are open (its key). */
  openKey: string | null;
  onOpen: (entry: DayEntry) => void;
  onClose: () => void;
  /** Details next to the event (popover); false on phones, where the page shows them in a sheet. */
  inPopover: boolean;
  details: (entry: DayEntry) => ReactNode;
}

interface EventButtonProps {
  entry: DayEntry;
  anchor: DetailsAnchor;
  /** Id of the element with the event's time or flags (its accessible description). */
  describedBy?: string | undefined;
  className: string;
  children: ReactNode;
}

export function EventButton({ entry, anchor, describedBy, className, children }: EventButtonProps) {
  const { t } = useTranslation();
  const { openKey, onOpen, onClose, inPopover, details } = anchor;
  const open = openKey === entry.key;
  const button = (
    <button
      type="button"
      aria-label={t("calendar.day.details", { title: entry.title || t("calendar.day.noTitle") })}
      aria-describedby={describedBy}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={
        inPopover
          ? undefined
          : () => {
              onOpen(entry);
            }
      }
      onContextMenu={(event) => {
        event.preventDefault();
        onOpen(entry);
      }}
      className={className}
    >
      {children}
    </button>
  );
  if (!inPopover) return button;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen(entry);
        else onClose();
      }}
    >
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label={t("calendar.details.title")}
        className="max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
      >
        {open ? details(entry) : null}
      </PopoverContent>
    </Popover>
  );
}
