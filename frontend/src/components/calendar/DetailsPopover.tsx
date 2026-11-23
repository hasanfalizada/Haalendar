// +++===+++ 2026-11-19 11:40 +04 — Hasan Alizada — HAAL-189. The details card of an event on tablets and desktops,
// shared by the day list and the grids (week, month, agenda): it opens at the point clicked (or right-clicked), beside
// the cursor, and stays inside the calendar's area (`boundary`), flipping to the other side of the cursor where there
// is no room. Opened from the keyboard it opens at the event, inside the area too.
import { type MouseEvent, type ReactElement, type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DetailsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Another card is open: this one closes because of it and leaves the focus there. */
  anotherOpen: boolean;
  /** Where the card opens from the keyboard: beside the event, or below a row as wide as the list. */
  side: "right" | "bottom";
  /** The calendar's area the card stays inside (the window when null). */
  boundary: Element | null;
  /** The event's button. */
  children: ReactElement;
  /** The card's inside, made only while it is open. */
  content: () => ReactNode;
}

interface Point {
  x: number;
  y: number;
}

export function DetailsPopover({
  open,
  onOpenChange,
  anotherOpen,
  side,
  boundary,
  children,
  content,
}: DetailsPopoverProps) {
  const { t } = useTranslation();
  const [point, setPoint] = useState<Point | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Always the anchor, so the event's button is never put into another element between the press and the click (it
  // would lose the click): the point clicked, or the event itself when opened from the keyboard.
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          point
            ? DOMRect.fromRect({ x: point.x, y: point.y, width: 0, height: 0 })
            : (trigger.current?.getBoundingClientRect() ?? new DOMRect()),
      },
    }),
    [point],
  );
  const at = (event: MouseEvent) => {
    setPoint({ x: event.clientX, y: event.clientY });
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverTrigger
        ref={trigger}
        asChild
        onPointerDown={at}
        onContextMenu={at}
        onKeyDown={() => {
          setPoint(null);
        }}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent
        side={point ? "right" : side}
        align="start"
        sideOffset={point ? 4 : 6}
        collisionPadding={8}
        {...(boundary ? { collisionBoundary: boundary } : {})}
        aria-label={t("calendar.details.title")}
        // Closed because another card opened (a click on another event), it leaves the focus there: given back to
        // its own event, it closed the new card at once.
        onCloseAutoFocus={(event) => {
          if (anotherOpen) event.preventDefault();
        }}
        // +++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F5). No taller than the room on its side, so
        // the actions at its end stay reachable inside the window.
        className="max-h-[min(70vh,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-4"
      >
        {open ? content() : null}
      </PopoverContent>
    </Popover>
  );
}
