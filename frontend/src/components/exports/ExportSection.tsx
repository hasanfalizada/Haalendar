// +++===+++ 2026-10-18 — Hasan Alizada — HAAL-043. "Your data" in Settings (FR-X-14, D-48, Google-Takeout style):
// choose modules and whether to include images, create an export (password confirmation), follow its progress, and
// download the ZIP while it is available (7 days). The archive is prepared in the background; when it becomes ready
// while the page is open a notification says so (an e-mail is sent as well when mail is configured).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { exportKeys, exportsQuery, isPending } from "@/api/exports";
import { requestExport } from "@/api/generated/sdk.gen";
import type { ExportRequest } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { formatInstant, useDisplayTimeZone } from "@/lib/datetime";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Module = ExportRequest["modules"][number];
const MODULES: readonly Module[] = ["calendar", "todo", "kanban"];

function formatSize(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, bytes / 1024))} KB`;
}

const STATUS_TONE: Record<ExportRequest["status"], string> = {
  queued: "bg-surface-2 text-fg",
  running: "bg-primary-tint text-primary",
  ready: "bg-primary-tint text-primary",
  failed: "bg-warn-bg text-warn-fg",
  expired: "bg-surface text-muted",
};

export function ExportSection() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const timeZone = useDisplayTimeZone();
  const { data: requests = [] } = useQuery(exportsQuery);
  const [modules, setModules] = useState<Module[]>([...MODULES]);
  const [images, setImages] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = requests.some(isPending);

  // A request that turns ready while the page is open is announced once.
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    for (const request of requests) {
      const before = seen.current.get(request.id);
      if (before && before !== "ready" && request.status === "ready") notify.success(t("export.ready"));
      seen.current.set(request.id, request.status);
    }
  }, [requests, t]);

  async function create() {
    setBusy(true);
    await runWrite({
      name: "export_request",
      run: () => withReauth(() => requestExport({ body: { modules, include_images: images } })),
      success: t("export.queued"),
      reasons: (problem) => (problem.code === "invalid_state" ? t("export.busy") : null),
    });
    setBusy(false);
    await queryClient.invalidateQueries({ queryKey: exportKeys.all });
  }

  function toggle(module: Module, on: boolean) {
    setModules((current) => MODULES.filter((m) => (m === module ? on : current.includes(m))));
  }

  return (
    <section id="export" aria-labelledby="export-title" className="flex flex-col gap-4 border-t border-line p-4">
      <h2 id="export-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("export.title")}
      </h2>
      <p className="max-w-2xl text-[13px] text-muted">{t("export.intro")}</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium">{t("export.choose")}</legend>
        {MODULES.map((module) => (
          <label key={module} className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={modules.includes(module)}
              onChange={(event) => {
                toggle(module, event.target.checked);
              }}
            />
            {t(`export.modules.${module}`)}
          </label>
        ))}
        <label className="mt-1 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={images}
            onChange={(event) => {
              setImages(event.target.checked);
            }}
          />
          {t("export.images")}
        </label>
      </fieldset>
      <Button
        variant="primary"
        className="w-fit"
        disabled={busy || pending || modules.length === 0}
        onClick={() => void create()}
      >
        {t("export.create")}
      </Button>

      {requests.length > 0 ? (
        <ul
          aria-label={t("export.history")}
          className="flex flex-col divide-y divide-line rounded-sm border border-line"
        >
          {requests.map((request) => (
            <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {request.modules.map((m) => t(`export.modules.${m}`)).join(", ")}
                  {request.include_images ? ` · ${t("export.withImages")}` : ""}
                </span>
                <span className="block text-xs text-muted">
                  {t("export.requested", { date: formatInstant(request.requested_at, timeZone, i18n.language) })}
                  {request.status === "ready" && request.expires_at
                    ? ` · ${t("export.until", { date: formatInstant(request.expires_at, timeZone, i18n.language) })}`
                    : ""}
                  {request.size_bytes !== undefined ? ` · ${formatSize(request.size_bytes, i18n.language)}` : ""}
                </span>
              </span>
              <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", STATUS_TONE[request.status])}>
                {t(`export.status.${request.status}`)}
              </span>
              {request.status === "ready" && request.download_url ? (
                <Button asChild>
                  <a href={request.download_url} download>
                    <Download aria-hidden />
                    {t("export.download")}
                  </a>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
