// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. "Add link…" (D-98): a search over every event, note and card on the
// device that can still be linked (not the item itself, not linked yet), several chosen at once, then "Link n items".
// No form of its own: the dialog is rendered inside the card or note editor's form (through a portal, the React tree
// still nests), so a submit here would also submit the editor.
import { CalendarDays, Columns3, StickyNote } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { linkCandidates } from "@/lib/links";

import { createLinks } from "./linkWrites";

type Row = Record<string, unknown>;

const ICONS = { event: CalendarDays, note: StickyNote, card: Columns3 } as const;

interface LinkPickerProps {
  user: string;
  item: Row;
  items: readonly Row[];
  links: readonly Row[];
  name: (row: Row) => string;
  onClose: () => void;
}

export function LinkPicker({ user, item, items, links, name, onClose }: LinkPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const itemId = String(item.id);
  const found = linkCandidates(items, links, itemId, query);

  async function link() {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    const ok = await createLinks(user, itemId, name(item), chosen);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title={t("links.addTitle", { title: name(item) })} closeLabel={t("common.close")}>
        <div className="flex flex-col gap-3">
          <Input
            type="search"
            autoFocus
            aria-label={t("links.search")}
            placeholder={t("links.search")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              // Enter would submit the editor's form around.
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          {found.length === 0 ? <p className="text-xs text-muted">{t("links.nothing")}</p> : null}
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {found.map((row) => {
              const id = String(row.id);
              const kind = row.kind as keyof typeof ICONS;
              const Icon = ICONS[kind];
              return (
                <li key={id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px] hover:bg-surface pointer-fine:md:min-h-8">
                    <input
                      type="checkbox"
                      checked={chosen.includes(id)}
                      onChange={(e) => {
                        setChosen(e.target.checked ? [...chosen, id] : chosen.filter((other) => other !== id));
                      }}
                    />
                    <Icon className="size-4 shrink-0 text-muted" aria-label={t(`links.kinds.${kind}`)} />
                    <span className="min-w-0 flex-1 truncate">{name(row)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={chosen.length === 0 || busy} onClick={() => void link()}>
            {t("links.link", { count: Math.max(chosen.length, 1) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
