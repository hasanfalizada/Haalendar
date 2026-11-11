// +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. One unresolved sync conflict (FR-OFF-04, ADR-0009):
// - same fields changed: both values side by side, a choice per field plus "Keep all mine" / "Keep all theirs";
// - deleted elsewhere: my values with "Restore with my changes" / "Discard my changes" (asks first);
// - refused (no access, invalid, not found): the reason and my values, "Copy" and "Dismiss" (asks first).
// Values are shown readably: colours as swatch and name, priority as its badge, Markdown as plain text (long text
// folded), empty values named as such.
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { reasonFor, runWrite, type WriteFailureCode } from "@/api/write";
import { Button } from "@/components/ui/button";
import { ColorSwatch } from "@/components/ui/color-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PriorityBadge } from "@/components/ui/priority";
import { useInstantFormat } from "@/lib/datetime";
import { toPlainText } from "@/lib/markdown-text";
import { notify } from "@/lib/notify";
import type { ConflictRecord } from "@/sync/db";
import { conflictKind, letGo, recordName, resolveFields, restoreWithMine, shownFields } from "@/sync/conflicts";

const FOLD = 160;
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. Note and checklist item fields (D-87, D-88).
const KNOWN_FIELDS = [
  "name",
  "title",
  "body",
  "color",
  "priority",
  "container_kind",
  "container_id",
  "text",
  "checked",
  "position",
  "pinned",
  "archived_at",
  "is_checklist",
  // +++===+++ 2026-10-31 — Hasan Alizada — HAAL-142. Event, card, column, reminder and calendar fields.
  "location",
  "all_day",
  "start_date",
  "start_time",
  "end_date",
  "end_time",
  "tzid",
  "rrule",
  "column_id",
  "due_date",
  "due_time",
  "wip_limit",
  "remind_at",
  "is_default",
] as const;
type KnownField = (typeof KNOWN_FIELDS)[number];

/** Text of a value as it is stored (strings as they are, anything else as JSON). */
function asText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function Value({ field, value }: { field: string; value: unknown }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted italic">{t("sync.empty")}</span>;
  }
  if (field === "color" && typeof value === "string") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ColorSwatch color={value as Color} />
        {t(`palette.colors.${value}`, { defaultValue: value })}
      </span>
    );
  }
  if (field === "priority" && typeof value === "string") return <PriorityBadge priority={value as Priority} />;
  const shown = field === "body" && typeof value === "string" ? toPlainText(value) : asText(value);
  if (shown.length <= FOLD) return <span className="wrap-anywhere whitespace-pre-wrap">{shown}</span>;
  return (
    <span className="wrap-anywhere whitespace-pre-wrap">
      {open ? shown : `${shown.slice(0, FOLD)}…`}{" "}
      <button
        type="button"
        className="text-primary underline underline-offset-2"
        onClick={() => {
          setOpen(!open);
        }}
      >
        {open ? t("sync.showLess") : t("sync.showAll")}
      </button>
    </span>
  );
}

function fieldLabel(t: TFunction, field: string): string {
  return (KNOWN_FIELDS as readonly string[]).includes(field) ? t(`sync.fields.${field as KnownField}`) : field;
}

export function ConflictCard({
  user,
  conflict,
  onDone,
}: {
  user: string;
  conflict: ConflictRecord;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const format = useInstantFormat();
  const kind = conflictKind(conflict);
  const fields = shownFields(conflict);
  const [choice, setChoice] = useState<Record<string, "mine" | "theirs">>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const name = recordName(conflict) || t(`sync.entity.${conflict.entity_type}`);

  async function act(action: string, run: () => Promise<{ data: unknown }>) {
    setBusy(true);
    await runWrite({ name: `sync_conflict_${action}`, run, success: t("sync.resolved") });
    setBusy(false);
    onDone();
  }

  async function copy() {
    const text = fields.map((field) => `${fieldLabel(t, field)}: ${asText(conflict.mine[field] ?? "")}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify.success(t("sync.copied"));
    } catch {
      notify.failure(t("sync.copyFailed"));
    }
  }

  const titleId = `conflict-${conflict.id}`;
  return (
    <li aria-labelledby={titleId} className="flex flex-col gap-3 px-3 py-3 text-[13px]">
      <div className="flex flex-col gap-0.5">
        <span id={titleId} className="font-medium wrap-anywhere">
          {t(`sync.entity.${conflict.entity_type}`)}: {name}
        </span>
        <span className="text-xs text-muted">
          {t(`sync.kind.${kind}`)} · {format.instant(conflict.created_at)}
        </span>
        {kind === "rejected" ? (
          <span className="text-xs text-warn-fg">
            {reasonFor((conflict.problem?.code ?? "http_error") as WriteFailureCode, null, false)}
          </span>
        ) : null}
      </div>

      {kind === "fields" ? (
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="sr-only">{t("sync.chooseLegend", { name })}</legend>
          {fields.map((field) => (
            <div key={field} className="grid gap-1 rounded-sm border border-line p-2 md:grid-cols-[8rem_1fr_1fr]">
              <span className="font-medium">{fieldLabel(t, field)}</span>
              {(["mine", "theirs"] as const).map((side) => (
                <label key={side} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name={`${conflict.id}-${field}`}
                    checked={choice[field] === side}
                    onChange={() => {
                      setChoice({ ...choice, [field]: side });
                    }}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted">{t(`sync.${side}`)}</span>
                    <Value field={field} value={side === "mine" ? conflict.mine[field] : conflict.theirs?.[field]} />
                  </span>
                </label>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || fields.some((field) => !choice[field])}
              onClick={() => void act("choice", () => resolveFields(user, conflict, choice))}
            >
              {t("sync.applyChoice")}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act("mine", () =>
                  resolveFields(user, conflict, Object.fromEntries(fields.map((f) => [f, "mine" as const]))),
                )
              }
            >
              {t("sync.keepAllMine")}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void act("theirs", () =>
                  resolveFields(user, conflict, Object.fromEntries(fields.map((f) => [f, "theirs" as const]))),
                )
              }
            >
              {t("sync.keepAllTheirs")}
            </Button>
          </div>
        </fieldset>
      ) : (
        <>
          {fields.length > 0 ? (
            <dl className="grid gap-1 rounded-sm border border-line p-2 md:grid-cols-[8rem_1fr]">
              {fields.map((field) => (
                <div key={field} className="contents">
                  <dt className="font-medium">{fieldLabel(t, field)}</dt>
                  <dd>
                    <Value field={field} value={conflict.mine[field]} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-muted">{t(`sync.op.${conflict.op ?? "update"}`)}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {kind === "deleted" ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void act("restore", () => restoreWithMine(user, conflict))}
              >
                {t("sync.restoreWithMine")}
              </Button>
            ) : (
              <Button disabled={busy || fields.length === 0} onClick={() => void copy()}>
                {t("sync.copy")}
              </Button>
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t(kind === "deleted" ? "sync.discard" : "sync.dismiss")}
            </Button>
          </div>
          <ConfirmDialog
            open={confirming}
            title={t(kind === "deleted" ? "sync.discardTitle" : "sync.dismissTitle")}
            body={t("sync.letGoBody")}
            confirmLabel={t(kind === "deleted" ? "sync.discard" : "sync.dismiss")}
            danger
            onConfirm={async () => {
              setConfirming(false);
              await act("let_go", () => letGo(user, conflict));
            }}
            onClose={() => {
              setConfirming(false);
            }}
          />
        </>
      )}
    </li>
  );
}
