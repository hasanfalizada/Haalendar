// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Shows a one-time password exactly once (invitation or reset without
// SMTP). It is never stored or logged on the client; the user must replace it at the first sign-in.
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { log } from "@/lib/log";

export interface OneTimePassword {
  email: string;
  password: string;
}

export function OneTimePasswordDialog({ value, onClose }: { value: OneTimePassword | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  function close() {
    setCopied(false);
    onClose();
  }

  return (
    <Dialog
      open={value !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {value ? (
        <DialogContent
          title={t("admin.oneTime.title")}
          description={t("admin.oneTime.body", { email: value.email })}
          closeLabel={t("common.close")}
        >
          <div className="flex gap-2">
            <Input
              readOnly
              aria-label={t("admin.oneTime.label")}
              value={value.password}
              className="font-mono"
              onFocus={(e) => {
                e.target.select();
              }}
            />
            <Button
              aria-label={copied ? t("admin.oneTime.copied") : t("admin.oneTime.copy")}
              onClick={() => {
                navigator.clipboard.writeText(value.password).then(
                  () => {
                    setCopied(true);
                  },
                  () => {
                    log.warn("clipboard_unavailable");
                  },
                );
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
          <p className="text-xs text-muted">{t("admin.oneTime.once")}</p>
          <DialogFooter>
            <Button variant="primary" onClick={close}>
              {t("admin.oneTime.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
