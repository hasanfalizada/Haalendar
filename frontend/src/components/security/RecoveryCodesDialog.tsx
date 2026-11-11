// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-171. Shows the 10 recovery codes exactly once (after enabling 2FA or
// regenerating), with copy and download. They are never stored or logged by the web app.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { log } from "@/lib/log";

export function RecoveryCodesDialog({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = (codes ?? []).join("\n");

  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([`${t("security.codes.fileHeader")}\n\n${text}\n`], { type: "text/plain" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "haalendar-recovery-codes.txt";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      log.warn("recovery_codes_download_unavailable");
    }
  }

  return (
    <Dialog
      open={codes !== null}
      onOpenChange={(next) => {
        if (!next) {
          setCopied(false);
          onClose();
        }
      }}
    >
      {codes ? (
        <DialogContent
          title={t("security.codes.title")}
          description={t("security.codes.body")}
          closeLabel={t("common.close")}
        >
          <ul
            aria-label={t("security.codes.title")}
            className="grid grid-cols-2 gap-2 rounded-sm bg-surface p-3 font-mono text-[13px]"
          >
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(text).then(
                  () => {
                    setCopied(true);
                  },
                  () => {
                    log.warn("clipboard_unavailable");
                  },
                );
              }}
            >
              {copied ? t("security.codes.copied") : t("security.codes.copy")}
            </Button>
            <Button onClick={download}>{t("security.codes.download")}</Button>
          </div>
          <DialogFooter>
            <Button
              variant="primary"
              onClick={() => {
                setCopied(false);
                onClose();
              }}
            >
              {t("security.codes.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
