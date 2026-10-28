// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-033. Unified trash (FR-X-04): newest deletions first, filter by module,
// one entry per delete batch with what it contains, who deleted it and when, restore one entry or many (multi-select:
// checkbox, Shift+click range, select all, Esc, long press on touch). An item whose container is still in the trash
// offers to restore the container as well. Nothing is ever purged.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Results through runWrite: one notification per restore.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-036. The shared bulk bar; Ctrl/Cmd+click on a row and Ctrl/Cmd+A select.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-037. Keyboard: ↑/↓ between entries, Space selects, Enter restores.
// Delete does nothing here: the trash keeps everything (no purge, D-38).
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { restoreFromTrash } from "@/api/generated/sdk.gen";
import type { TrashEntry } from "@/api/generated/types.gen";
import { type TrashModule, trashKeys, trashQuery } from "@/api/trash";
import { runWrite } from "@/api/write";
import { BulkBar } from "@/components/ui/bulk-bar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/input";
import { RecordTimestamps } from "@/components/ui/record-timestamps";
import { useListNavigation } from "@/lib/useListNavigation";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";

const MODULES: readonly TrashModule[] = ["event", "note", "card", "calendar", "board", "column", "attachment"];

interface Parent {
  type: string;
  id: string;
  title: string;
}

export function TrashPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [module, setModule] = useState<TrashModule | "">("");
  const trash = useInfiniteQuery(trashQuery(module));
  const entries: TrashEntry[] = trash.data?.pages.flatMap((page) => page.data) ?? [];
  const selection = useSelection(
    entries.map((e) => e.id),
    { selectAllShortcut: true },
  );
  const [pendingParent, setPendingParent] = useState<{
    parent: Parent;
    entries: { type: string; id: string }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore(targets: { type: string; id: string }[]) {
    setBusy(true);
    const result = await runWrite({
      name: "trash_restore",
      run: () =>
        restoreFromTrash({ body: { entries: targets.map((e) => ({ type: e.type as TrashModule, id: e.id })) } }),
      success: (data) => {
        const others = data.failed.filter((f) => f.code !== "parent_in_trash");
        const parts: string[] = [];
        if (data.restored > 0) parts.push(t("trash.restored", { count: data.restored }));
        if (others.length > 0) parts.push(t("trash.failed", { count: others.length }));
        // Only "the container is in the trash too": the dialog below is the answer.
        if (parts.length === 0) return null;
        return others.length > 0 ? { failure: parts.join(" ") } : parts.join(" ");
      },
    });
    if (result.ok) {
      const blocked = result.data.failed.filter((f) => f.code === "parent_in_trash");
      const parent = blocked.find((f) => f.parent)?.parent;
      if (parent) setPendingParent({ parent, entries: blocked.map((f) => ({ type: f.type, id: f.id })) });
      selection.clear();
    }
    setBusy(false);
    await queryClient.invalidateQueries({ queryKey: trashKeys.all });
  }

  function describeContents(entry: TrashEntry): string {
    return Object.entries(entry.contents)
      .map(([type, count]) => t(`trash.plural.${type}` as "trash.plural.event", { count }))
      .join(", ");
  }

  const navigation = useListNavigation(
    entries.map((e) => e.id),
    selection,
    {
      openLabel: "shortcuts.restore",
      onOpen: (id) => {
        const entry = entries.find((e) => e.id === id);
        if (entry && !busy) void restore([{ type: entry.type, id: entry.id }]);
      },
    },
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="flex-1 text-lg font-semibold">{t("pages.trash.title")}</h1>
        <Select
          aria-label={t("trash.module")}
          value={module}
          className="w-44"
          onChange={(e) => {
            setModule(MODULES.find((m) => m === e.target.value) ?? "");
            selection.clear();
          }}
        >
          <option value="">{t("trash.all")}</option>
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {t(`trash.types.${m}`)}
            </option>
          ))}
        </Select>
      </div>

      {trash.isSuccess && entries.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-2">
            <div className="grid size-12 place-items-center rounded-md bg-primary-tint text-primary">
              <Trash2 className="size-6" aria-hidden />
            </div>
            <h2 className="text-[15px] font-semibold">{t("pages.trash.emptyTitle")}</h2>
            <p className="text-muted">{t("pages.trash.emptyBody")}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-[13px] text-muted">{t("trash.intro")}</p>
          {trash.isError ? (
            <p role="alert" className="text-[13px] text-danger">
              {t("trash.loadFailed")}
            </p>
          ) : null}
          {entries.length > 0 ? (
            <BulkBar
              selection={selection}
              total={entries.length}
              actions={["restore"]}
              busy={busy}
              onAction={() =>
                void restore(entries.filter((e) => selection.isSelected(e.id)).map((e) => ({ type: e.type, id: e.id })))
              }
            />
          ) : null}
          <ul
            className="flex flex-col divide-y divide-line"
            aria-label={t("pages.trash.title")}
            {...navigation.listProps}
          >
            {entries.map((entry) => {
              const contents = describeContents(entry);
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "flex items-start gap-3 py-2 select-none",
                    selection.isSelected(entry.id) && "bg-primary-tint/40",
                  )}
                  {...selection.rowProps(entry.id)}
                  {...navigation.itemProps(entry.id)}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    aria-label={t("trash.select", { title: entry.title })}
                    checked={selection.isSelected(entry.id)}
                    // +++===+++ 2026-10-28 — Hasan Alizada — HAAL-084. A prevented click on a controlled checkbox
                    // left the box drawn unchecked; Shift comes from the click that changed it.
                    onChange={(event) => {
                      selection.toggle(entry.id, { range: (event.nativeEvent as MouseEvent).shiftKey });
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{entry.title}</div>
                    <div className="text-xs text-muted">
                      {t(`trash.types.${entry.type}`)}
                      {entry.container_name ? ` · ${entry.container_name}` : ""}
                      {contents ? ` · ${contents}` : ""}
                    </div>
                    <RecordTimestamps
                      record={{
                        created_at: entry.created_at,
                        updated_at: entry.updated_at,
                        deleted_at: entry.deleted_at,
                        updated_by: entry.deleted_by,
                      }}
                      names={{ deleted: entry.deleted_by_name }}
                      className="mt-1 flex flex-col gap-0.5 text-xs text-muted"
                    />
                  </div>
                  <Button disabled={busy} onClick={() => void restore([{ type: entry.type, id: entry.id }])}>
                    {t("trash.restore")}
                  </Button>
                </li>
              );
            })}
          </ul>
          {trash.hasNextPage ? (
            <Button
              className="self-center"
              onClick={() => void trash.fetchNextPage()}
              disabled={trash.isFetchingNextPage}
            >
              {t("trash.loadMore")}
            </Button>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={pendingParent !== null}
        title={t("trash.parentTitle", { title: pendingParent?.parent.title ?? "" })}
        body={t("trash.parentBody", { title: pendingParent?.parent.title ?? "" })}
        confirmLabel={t("trash.parentConfirm")}
        onConfirm={async () => {
          if (!pendingParent) return;
          const { parent, entries: blocked } = pendingParent;
          setPendingParent(null);
          await restore([{ type: parent.type, id: parent.id }, ...blocked]);
        }}
        onClose={() => {
          setPendingParent(null);
        }}
      />
    </div>
  );
}
