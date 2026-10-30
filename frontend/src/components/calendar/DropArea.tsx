// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-090. A place in the week or month grid where an event can be dropped
// (D-78): a day's time column, a day's all-day cell or a month day; `data` tells the grid what was hit. It is
// highlighted while an event is over it.
import { useDroppable } from "@dnd-kit/core";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface DropData {
  kind: "time" | "allday" | "day";
  day: string;
}

interface DropAreaProps {
  id: string;
  data: DropData;
  as?: "div" | "ol" | "ul";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  children?: ReactNode;
}

export function DropArea({ id, data, as: Tag = "div", className, style, children, ...rest }: DropAreaProps) {
  const { setNodeRef, isOver, active } = useDroppable({ id, data });
  // +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. A note or card from the panel fits several kinds of place.
  const accepts = (active?.data.current as { accepts?: DropData["kind"] | readonly DropData["kind"][] } | undefined)
    ?.accepts;
  const fits = Array.isArray(accepts) ? accepts.includes(data.kind) : accepts === data.kind;
  return (
    <Tag
      ref={setNodeRef}
      data-drop={id}
      className={cn(className, isOver && fits && "outline-2 -outline-offset-2 outline-primary/60")}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
