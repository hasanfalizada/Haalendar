// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-167. Sharing overview in Settings: what I shared (change permission,
// remove access) and what others shared with me (leave). Changes need a connection.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Results are notifications (runWrite).
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { Share } from "@/api/generated/types.gen";
import { sharesQuery } from "@/api/sharing";

import { ShareRow } from "./ShareRow";
import { useShareActions } from "./useShareActions";

export function SharingSection() {
  const { t } = useTranslation();
  const actions = useShareActions();
  const granted = useQuery(sharesQuery({ direction: "granted" }));
  const received = useQuery(sharesQuery({ direction: "received" }));
  async function report(promise: Promise<unknown>) {
    await promise;
  }

  const kindLabel = (share: Share) => t(`sharing.kind.${share.container_kind}`);

  return (
    <section
      id="sharing"
      tabIndex={-1}
      aria-labelledby="sharing-title"
      className="flex scroll-mt-2 flex-col gap-4 border-t border-line p-4 outline-none"
    >
      <h2 id="sharing-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("sharing.title")}
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium">{t("sharing.sharedByMe")}</h3>
        {(granted.data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">{t("sharing.noneByMe")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-sm border border-line">
            {(granted.data ?? []).map((share) => (
              <ShareRow
                key={share.id}
                share={share}
                title={share.grantee_name}
                subtitle={`${kindLabel(share)} · ${share.container_name}`}
                mode="owner"
                onChangePermission={(s, p) => report(actions.changePermission(s, p))}
                onRemove={(s) => report(actions.revoke(s, "owner"))}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-medium">{t("sharing.sharedWithMe")}</h3>
        {(received.data ?? []).length === 0 ? (
          <p className="text-[13px] text-muted">{t("sharing.noneWithMe")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-sm border border-line">
            {(received.data ?? []).map((share) => (
              <ShareRow
                key={share.id}
                share={share}
                title={share.container_name}
                subtitle={t("sharing.from", { kind: kindLabel(share), name: share.owner_name })}
                mode="grantee"
                onRemove={(s) => report(actions.revoke(s, "grantee"))}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
