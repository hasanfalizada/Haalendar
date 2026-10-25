// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-081. Colour straight from the details card (FR-CAL-18, U#3, D-70): the
// palette picker saves the chosen colour through the local store (offline too) with a toast and undo. Arrow keys pick
// a colour at every press, so the write waits 0.6 s after the last choice — one write, one toast, one undo step; a
// choice still waiting is written at once when the card closes. A series changes as a whole (hint shown); a calendar
// shared for viewing shows the colour only.
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import { ColorPicker, ColorSwatch } from "@/components/ui/color-picker";
import { DEFAULT_COLOR } from "@/lib/palette";
import { newStep } from "@/lib/undo";
import { mutate } from "@/sync";

type Row = Record<string, unknown>;

export const COLOR_SAVE_DELAY_MS = 600;

interface EventColorProps {
  user: string;
  row: Row;
  writable: boolean;
}

export function EventColor({ user, row, writable }: EventColorProps) {
  const { t } = useTranslation();
  const stored = (typeof row.color === "string" ? row.color : DEFAULT_COLOR) as Color;
  const [chosen, setChosen] = useState<Color | null>(null);
  const pending = useRef<Color | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What the write needs, current at the moment it runs (also from the cleanup when the card closes).
  const latest = useRef({ user, row, stored, t });
  useEffect(() => {
    latest.current = { user, row, stored, t };
  });

  const write = useCallback(() => {
    clearTimeout(timer.current);
    const color = pending.current;
    pending.current = null;
    const { user: owner, row: event, stored: before, t: translate } = latest.current;
    if (color === null || color === before || !owner) return;
    const id = String(event.id);
    const title =
      typeof event.title === "string" && event.title !== "" ? event.title : translate("calendar.day.noTitle");
    const version = typeof event.version === "number" ? { base_version: event.version } : {};
    void runWrite({
      name: "event_color",
      run: () =>
        mutate(owner, {
          entity_type: "item",
          entity_id: id,
          op: "update",
          ...version,
          base: { color: before },
          data: { color },
        }),
      success: translate("calendar.details.colorChanged", { title }),
      undo: () =>
        newStep(
          "event.update",
          { key: "undo.labels.eventEdited", values: { title } },
          { user: owner, id, before: { color: before }, after: { color } },
        ),
    });
  }, []);

  // The card closes: a choice still waiting is written now.
  useEffect(() => write, [write]);

  if (!writable) {
    return (
      <p className="flex items-center gap-1.5 text-muted">
        <ColorSwatch color={stored} />
        {t(`palette.colors.${stored}`)}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <ColorPicker
        name={`event-color-${String(row.id)}`}
        legend={t("calendar.editor.color")}
        value={chosen ?? stored}
        onChange={(color) => {
          setChosen(color);
          pending.current = color;
          clearTimeout(timer.current);
          timer.current = setTimeout(write, COLOR_SAVE_DELAY_MS);
        }}
      />
      {row.rrule ? <p className="text-xs text-muted">{t("calendar.details.colorSeries")}</p> : null}
    </div>
  );
}
