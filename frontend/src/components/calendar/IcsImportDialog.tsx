// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. ICS import into a calendar (FR-CAL-33, D-83), from the calendar
// list's menu: choose an .ics file (at most 5 MB), Import sends it to the server (needs a connection); the dialog then
// shows the report — imported and skipped counts, every skipped event with its reason, the warnings — and the
// notification offers Undo: the imported events go to the trash as one step.
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { importIcs } from "@/api/generated/sdk.gen";
import { runWrite } from "@/api/write";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { batchStep, newStep } from "@/lib/undo";

const MAX_BYTES = 5 * 1024 * 1024;

interface Report {
  imported: number;
  skipped: number;
  warnings: string[];
  item_ids: string[];
  skipped_events: { title: string; reason: string }[];
}

interface IcsImportDialogProps {
  user: string;
  calendar: Record<string, unknown>;
  onClose: () => void;
}

export function IcsImportDialog({ user, calendar, onClose }: IcsImportDialogProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const name = String(calendar.name);
  const tooLarge = file !== null && file.size > MAX_BYTES;

  async function start() {
    if (!file || tooLarge) return;
    setBusy(true);
    setError(null);
    const result = await runWrite<Report>({
      name: "ics_import",
      run: () =>
        importIcs({
          path: { id: String(calendar.id) },
          body: file,
          bodySerializer: null,
          headers: { "Content-Type": "text/calendar" },
        }),
      // A repeat would import the file again (what is there would be skipped, but the report would say so).
      retry: false,
      failure: "inline",
      success: (data) => t("ics.imported", { count: data.imported, name }),
      undo: (data) =>
        data.item_ids.length > 0
          ? batchStep(
              { key: "undo.labels.icsImported", values: { name } },
              data.item_ids.map((id) =>
                newStep("event.create", { key: "undo.labels.icsImported", values: { name } }, { user, id }),
              ),
            )
          : null,
    });
    setBusy(false);
    if (result.ok) setReport(result.data);
    else setError(result.reason);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent title={t("ics.importTitle", { name })} closeLabel={t("common.close")}>
        {report ? (
          <div className="flex flex-col gap-3 text-[13px]" role="status">
            <p className="font-medium">{t("ics.summary", { imported: report.imported, skipped: report.skipped })}</p>
            {report.skipped_events.length > 0 ? (
              <section aria-labelledby="ics-skipped" className="flex flex-col gap-1">
                <h3 id="ics-skipped" className="font-medium">
                  {t("ics.skippedTitle")}
                </h3>
                <ul className="max-h-48 list-disc overflow-y-auto pl-5">
                  {report.skipped_events.map((skipped, index) => (
                    <li key={index}>
                      {skipped.title} — <span className="text-muted">{skipped.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {report.warnings.length > 0 ? (
              <section aria-labelledby="ics-warnings" className="flex flex-col gap-1">
                <h3 id="ics-warnings" className="font-medium">
                  {t("ics.warningsTitle")}
                </h3>
                <ul className="max-h-36 list-disc overflow-y-auto pl-5 text-muted">
                  {report.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <DialogFooter>
              <Button variant="primary" onClick={onClose}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <p className="text-[13px] text-muted">{t("ics.intro")}</p>
            <Field id="ics-file" label={t("ics.file")} error={tooLarge ? t("ics.tooLarge") : (error ?? undefined)}>
              {(aria) => (
                <input
                  {...aria}
                  type="file"
                  accept=".ics,text/calendar"
                  className="text-[13px]"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                />
              )}
            </Field>
            <DialogFooter>
              <Button onClick={onClose} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={busy || !file || tooLarge}>
                {busy ? t("ics.importing") : t("ics.import")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
