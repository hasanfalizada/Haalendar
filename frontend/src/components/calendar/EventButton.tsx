// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-088. An event in the week and month grids (taken out of the week view,
// HAAL-087): a button named "Details of <title>" that opens the details card — a popover next to it on tablets and
// desktops, the page's sheet on phones; right-click opens it too (the browser menu is suppressed).
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-089. Also the agenda's rows; the description is optional there.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. With `drag` the button can be dragged in the week and month grids
// (D-78): mouse after 5 px, touch after a 300 ms hold (the grid's sensors); while dragged it fades. The click that ends
// a drag never reaches it (dnd-kit swallows clicks for a moment after a drop), so the card does not open.
import { useDraggable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { DayEntry } from "@/lib/dayView";
import { isOpenAt, type OpenDetails } from "@/lib/openDetails";
import { cn } from "@/lib/utils";

import { DetailsPopover } from "./DetailsPopover";
import type { DropData } from "./DropArea";

/** What every grid passes on from the page: which card is open and how to show it. */
export interface DetailsAnchor {
  open: OpenDetails | null;
  /** `place`: the day the entry is shown on, where it was clicked. */
  onOpen: (entry: DayEntry, place: string) => void;
  /** Closes this card only (not another one opened by the same click). */
  onClose: (entry: DayEntry, place: string) => void;
  /** Details next to the event (popover); false on phones, where the page shows them in a sheet. */
  inPopover: boolean;
  details: (entry: DayEntry) => ReactNode;
  /** The calendar's area the card stays inside. */
  boundary: Element | null;
}

interface EventButtonProps {
  entry: DayEntry;
  anchor: DetailsAnchor;
  /** Id of the element with the event's time or flags (its accessible description). */
  describedBy?: string | undefined;
  className: string;
  children: ReactNode;
  /** The day the entry is shown on (its card opens here). */
  place: string;
  /** Where the card opens from the keyboard (a click opens it at the cursor): beside the event in the grids, below a
   * row as wide as the list (the agenda). */
  side?: "right" | "bottom";
  /** Draggable in a grid: where it may land. */
  drag?: { accepts: DropData["kind"]; disabled: boolean };
}

/** What a dragged event carries to the grid's drop handler. */
export interface DragData {
  entry: DayEntry;
  day: string;
  accepts: DropData["kind"];
}

export function EventButton({
  entry,
  anchor,
  describedBy,
  className,
  children,
  place,
  side = "right",
  drag,
}: EventButtonProps) {
  const { t } = useTranslation();
  const { onOpen, onClose, inPopover, details } = anchor;
  const open = isOpenAt(anchor.open, entry.key, place);
  const data: DragData | undefined = drag ? { entry, day: place, accepts: drag.accepts } : undefined;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${place}|${entry.key}`,
    data,
    disabled: !drag || drag.disabled,
  });
  const button = (
    <button
      ref={setNodeRef}
      {...(drag && !drag.disabled ? listeners : {})}
      type="button"
      aria-label={t("calendar.day.details", { title: entry.title || t("calendar.day.noTitle") })}
      aria-describedby={describedBy}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={
        inPopover
          ? undefined
          : () => {
              onOpen(entry, place);
            }
      }
      onContextMenu={(event) => {
        event.preventDefault();
        onOpen(entry, place);
      }}
      className={cn(className, isDragging && "opacity-40")}
    >
      {children}
    </button>
  );
  if (!inPopover) return button;
  return (
    <DetailsPopover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen(entry, place);
        else onClose(entry, place);
      }}
      anotherOpen={anchor.open !== null}
      side={side}
      boundary={anchor.boundary}
      content={() => details(entry)}
    >
      {button}
    </DetailsPopover>
  );
}
