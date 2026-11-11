// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. The archived columns of a board (D-91), from the board menu: each
// with Unarchive for whoever may write (back on the board where its position puts it; deleting is done from there).
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { updateColumn } from "./columnWrites";

type Row = Record<string, unknown>;

interface ArchivedColumnsDialogProps {
  user: string;
  columns: Row[];
  canWrite: boolean;
  onClose: () => void;
}

export function ArchivedColumnsDialog({ user, columns, canWrite, onClose }: ArchivedColumnsDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t("kanban.columns.archivedTitle")} closeLabel={t("common.close")}>
        {columns.length === 0 ? (
          <p className="text-[13px] text-muted">{t("kanban.columns.archivedNone")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {columns.map((row) => {
              const name = String(row.name);
              return (
                <li key={String(row.id)} className="flex min-h-11 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{name}</span>
                  {canWrite ? (
                    <Button
                      aria-label={t("kanban.columns.unarchiveNamed", { name })}
                      onClick={() => {
                        void updateColumn(user, row, "unarchive", { archived_at: null });
                      }}
                    >
                      {t("kanban.unarchive")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
