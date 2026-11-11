// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. The links of an item (FR-INT-01, D-98) — in the card editor, the note
// editor and the event's details: each linked item with its kind and title (a click opens it: an event on its day, a
// note on the To-Do page, a card on its board), one in the trash greyed with "in the trash", one closed to the user as
// "Item you can't open"; Remove and "Add link…" (LinkPicker) for whoever may change the item. Written at once, with
// Undo.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, Columns3, Link2, Lock, StickyNote, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { noteName } from "@/components/todo/noteWrites";
import { Button } from "@/components/ui/button";
import { itemTarget, type LinkedItem, linkedItems } from "@/lib/links";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";

import { LinkPicker } from "./LinkPicker";
import { removeLink } from "./linkWrites";

type Row = Record<string, unknown>;

const ICONS = { event: CalendarDays, note: StickyNote, card: Columns3 } as const;

/** How an item is named in links and messages. */
function itemName(row: Row, untitled: string): string {
  if (row.kind === "note") return noteName(row);
  return typeof row.title === "string" && row.title.trim() ? row.title.trim() : untitled;
}

function useRows(user: string, entity: "link" | "item"): Row[] {
  const { data = [] } = useQuery({
    queryKey: [...localKeys.table(entity), user],
    queryFn: () => localRows(user, entity),
    enabled: Boolean(user),
  });
  return data;
}

interface ItemLinksProps {
  user: string;
  item: Row;
  /** The user may change the item (and so its links). */
  canWrite: boolean;
  /** Called before leaving for a linked item (the editor around closes). */
  onLeave?: () => void;
}

export function ItemLinks({ user, item, canWrite, onLeave }: ItemLinksProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const links = useRows(user, "link");
  const items = useRows(user, "item");
  const [picking, setPicking] = useState(false);
  const itemId = String(item.id);
  const untitled = t("notifications.unnamed");
  const linked = linkedItems(links, items, itemId);

  function open(entry: LinkedItem) {
    const target = entry.state === "open" && entry.row ? itemTarget(entry.row) : null;
    if (!target) return;
    onLeave?.();
    if (target.to === "/todo") void navigate({ to: "/todo", search: target.search });
    else if (target.to === "/kanban/$boardId") void navigate(target);
    else void navigate({ to: "/calendar", search: target.search });
  }

  return (
    <section aria-labelledby={`links-${itemId}`} className="flex flex-col gap-2">
      <h3 id={`links-${itemId}`} className="text-[13px] font-medium">
        {t("links.title")}
      </h3>
      {linked.length === 0 ? <p className="text-xs text-muted">{t("links.none")}</p> : null}
      <ul className="flex flex-col gap-1">
        {linked.map((entry) => {
          const kind = entry.row?.kind as keyof typeof ICONS | undefined;
          const Icon = kind && kind in ICONS ? ICONS[kind] : Lock;
          const name = entry.row ? itemName(entry.row, untitled) : t("links.closed");
          return (
            <li key={entry.linkId} className="flex items-center gap-2 text-[13px]">
              <Icon className="size-4 shrink-0 text-muted" aria-label={kind ? t(`links.kinds.${kind}`) : undefined} />
              {entry.state === "open" ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-primary hover:underline"
                  onClick={() => {
                    open(entry);
                  }}
                >
                  {name}
                </button>
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    entry.state === "trash" ? "text-muted line-through" : "text-muted",
                  )}
                >
                  {name}
                  {entry.state === "trash" ? <span className="ml-1 no-underline">({t("links.inTrash")})</span> : null}
                </span>
              )}
              {canWrite ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t("links.remove", { title: name })}
                  onClick={() => void removeLink(user, entry.linkId, name)}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <Button
          className="self-start"
          onClick={() => {
            setPicking(true);
          }}
        >
          <Link2 aria-hidden />
          {t("links.add")}
        </Button>
      ) : null}
      {picking ? (
        <LinkPicker
          user={user}
          item={item}
          items={items}
          links={links}
          name={(row) => itemName(row, untitled)}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
    </section>
  );
}
