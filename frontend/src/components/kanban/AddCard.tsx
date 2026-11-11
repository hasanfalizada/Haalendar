// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. "+ Add card" at the bottom of a column (D-92): opens a title field;
// Enter adds the card at the end of the column and keeps the field open for the next one, Esc (or leaving it empty)
// closes it.
import { Plus } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TITLE_MAX = 200;

interface AddCardProps {
  columnName: string;
  /** Writes a card with this title; true when written. */
  onAdd: (title: string) => Promise<boolean>;
}

export function AddCard({ columnName, onAdd }: AddCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onAdd(trimmed);
    setBusy(false);
    if (ok) setTitle("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void add();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setTitle("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start text-muted"
        aria-label={t("kanban.cards.addTo", { column: columnName })}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        {t("kanban.cards.add")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Input
        aria-label={t("kanban.cards.titleIn", { column: columnName })}
        placeholder={t("kanban.cards.titlePlaceholder")}
        value={title}
        maxLength={TITLE_MAX}
        autoFocus
        disabled={busy}
        onChange={(e) => {
          setTitle(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
      />
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy || !title.trim()} onClick={() => void add()}>
          {t("kanban.cards.addButton")}
        </Button>
        <Button
          onClick={() => {
            setTitle("");
            setOpen(false);
          }}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
