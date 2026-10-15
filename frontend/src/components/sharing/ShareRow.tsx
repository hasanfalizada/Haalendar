// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. One share in a list: who (or which container), the permission and
// the remove action with an inline confirmation. The owner can change the permission; a grantee sees it read-only.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Permission, Share } from "@/api/generated/types.gen";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

interface ShareRowProps {
  share: Share;
  title: string;
  subtitle: string;
  /** Owner view: permission select and "Remove"; grantee view: read-only permission and "Leave". */
  mode: "owner" | "grantee";
  onChangePermission?: (share: Share, permission: Permission) => Promise<void>;
  onRemove: (share: Share) => Promise<void>;
}

export function ShareRow({ share, title, subtitle, mode, onChangePermission, onRemove }: ShareRowProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const removeLabel = mode === "owner" ? t("sharing.remove") : t("sharing.leave");

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      {mode === "owner" && onChangePermission ? (
        <Select
          aria-label={t("sharing.permissionFor", { name: title })}
          value={share.permission}
          disabled={busy}
          className="w-36"
          onChange={(e) => {
            const next: Permission = e.target.value === "edit" ? "edit" : "view";
            void act(() => onChangePermission(share, next));
          }}
        >
          <option value="view">{t("sharing.permission.view")}</option>
          <option value="edit">{t("sharing.permission.edit")}</option>
        </Select>
      ) : (
        <span className="text-xs text-muted">{t(`sharing.permission.${share.permission}`)}</span>
      )}
      {confirming ? (
        <span className="flex items-center gap-1" role="group" aria-label={t("sharing.confirmGroup")}>
          <Button variant="danger" disabled={busy} onClick={() => void act(() => onRemove(share))}>
            {mode === "owner" ? t("sharing.confirmRemove") : t("sharing.confirmLeave")}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
            }}
          >
            {t("common.cancel")}
          </Button>
        </span>
      ) : (
        <Button
          variant="ghost"
          aria-label={`${removeLabel}: ${title}`}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {removeLabel}
        </Button>
      )}
    </li>
  );
}
