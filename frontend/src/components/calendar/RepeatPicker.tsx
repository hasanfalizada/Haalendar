// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. The editor's repeat rule (FR-CAL-30, D-80), in two parts:
// - RepeatSelect: "Does not repeat", the presets for the start date (every day; every week on its weekday; every month
//   on its day, its Nth or last weekday, the last day — only those the date allows; every year on it) and "Custom…";
// - RepeatCustom (shown after "Custom…" or for a rule that is no preset): every N days / weeks / months / years, the
//   weekdays (in the user's week order; at least one stays chosen — when the start's weekday is turned off, the start
//   moves to the next chosen day, so the rule always fits it), the monthly mode, and the end: never, on a date, after
//   N times. The rule as text is shown underneath; what does not fit is an error of the Repeat field.
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Input, Select } from "@/components/ui/input";
import { addDays } from "@/lib/datetime";
import { addMonths, sameDayIn } from "@/lib/monthGrid";
import {
  MAX_COUNT,
  MAX_INTERVAL,
  type MonthlyMode,
  type PresetKey,
  type RepeatEnd,
  type RepeatFreq,
  type RepeatSpec,
  describeSpec,
  monthlyModes,
  plainSpec,
  presetOf,
  presetSpec,
  presetsFor,
  weekdayIndex,
  weekdayLabel,
  weekdaysOf,
} from "@/lib/repeatRule";
import { cn } from "@/lib/utils";

const CUSTOM = "custom";
const FREQS: readonly RepeatFreq[] = ["daily", "weekly", "monthly", "yearly"];
const ENDS: readonly RepeatEnd[] = ["never", "until", "count"];

interface RepeatSelectProps {
  aria: { id: string; "aria-invalid"?: true; "aria-describedby"?: string };
  spec: RepeatSpec | null;
  start: string;
  custom: boolean;
  onPreset: (spec: RepeatSpec | null) => void;
  onCustom: () => void;
}

export function RepeatSelect({ aria, spec, start, custom, onPreset, onCustom }: RepeatSelectProps) {
  const { t } = useTranslation();
  const current = custom ? CUSTOM : presetOf(spec, start);
  const presets = presetsFor(start);
  // A preset the date no longer allows (e.g. "last day" after the date changed) stays listed, with the field's error.
  if (current !== CUSTOM && !presets.includes(current)) presets.push(current);
  const label = (key: PresetKey) => {
    const preset = presetSpec(key);
    return preset ? describeSpec(preset, start) : t("repeat.none");
  };
  return (
    <Select
      {...aria}
      value={current}
      onChange={(e) => {
        if (e.target.value === CUSTOM) onCustom();
        else onPreset(presetSpec(e.target.value as PresetKey));
      }}
    >
      {presets.map((key) => (
        <option key={key} value={key}>
          {label(key)}
        </option>
      ))}
      <option value={CUSTOM}>{t("repeat.custom")}</option>
    </Select>
  );
}

interface RepeatCustomProps {
  spec: RepeatSpec;
  start: string;
  /** The user's first day of the week (0 = Sunday). */
  weekStart: number;
  /** A new rule; with `start` when the start date has to move to fit it. */
  onChange: (spec: RepeatSpec, start?: string) => void;
}

const numberOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : "");

export function RepeatCustom({ spec, start, weekStart, onChange }: RepeatCustomProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const change = (patch: Partial<RepeatSpec>) => {
    onChange({ ...spec, ...patch });
  };
  const days = weekdaysOf(spec, start);
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i + 6) % 7); // Monday = 0
  const toggle = (day: number) => {
    const on = days.includes(day);
    if (on && days.length === 1) return;
    const next = (on ? days.filter((d) => d !== day) : [...days, day]).sort((a, b) => a - b);
    if (next.includes(weekdayIndex(start))) {
      onChange({ ...spec, weekdays: next });
      return;
    }
    // The start's weekday was turned off: the series starts on the next chosen day.
    let moved = addDays(start, 1);
    while (!next.includes(weekdayIndex(moved))) moved = addDays(moved, 1);
    onChange({ ...spec, weekdays: next }, moved);
  };
  const modes = monthlyModes(start);
  if (!modes.includes(spec.monthly)) modes.push(spec.monthly);

  return (
    <fieldset className="flex flex-col gap-3 rounded-sm border border-line p-3 text-[13px]">
      <legend className="px-1 font-medium">{t("repeat.customTitle")}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-interval`}>{t("repeat.every")}</label>
        <Input
          id={`${id}-interval`}
          type="number"
          min={1}
          max={MAX_INTERVAL}
          className="w-20"
          value={numberOf(spec.interval)}
          onChange={(e) => {
            change({ interval: e.target.valueAsNumber });
          }}
        />
        <Select
          aria-label={t("repeat.unit")}
          className="w-auto"
          value={spec.freq}
          onChange={(e) => {
            const freq = e.target.value as RepeatFreq;
            change({ freq, weekdays: [], monthly: "day" });
          }}
        >
          {FREQS.map((freq) => (
            <option key={freq} value={freq}>
              {t(`repeat.units.${freq}`, { count: numberOf(spec.interval) || 1 })}
            </option>
          ))}
        </Select>
      </div>

      {spec.freq === "weekly" ? (
        <div role="group" aria-label={t("repeat.weekdays")} className="flex flex-wrap gap-1">
          {order.map((day) => {
            const on = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={weekdayLabel(day, i18n.language)}
                title={weekdayLabel(day, i18n.language)}
                onClick={() => {
                  toggle(day);
                }}
                className={cn(
                  "size-9 rounded-full border text-xs font-medium",
                  on
                    ? "border-primary bg-primary text-primary-ink hover:bg-primary-hover"
                    : "border-line bg-bg text-fg hover:bg-surface",
                )}
              >
                {weekdayLabel(day, i18n.language, "narrow")}
              </button>
            );
          })}
        </div>
      ) : null}

      {spec.freq === "monthly" ? (
        <Select
          aria-label={t("repeat.monthlyMode")}
          value={spec.monthly}
          onChange={(e) => {
            change({ monthly: e.target.value as MonthlyMode });
          }}
        >
          {modes.map((mode) => (
            <option key={mode} value={mode}>
              {describeSpec({ ...plainSpec("monthly", mode), interval: numberOf(spec.interval) || 1 }, start)}
            </option>
          ))}
        </Select>
      ) : null}

      <div role="radiogroup" aria-label={t("repeat.ends")} className="flex flex-col gap-2">
        <span className="font-medium">{t("repeat.ends")}</span>
        {ENDS.map((end) => (
          <div key={end} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-end`}
                checked={spec.end === end}
                onChange={() => {
                  change({
                    end,
                    ...(end === "until" && !spec.until
                      ? { until: sameDayIn(start, addMonths(start.slice(0, 7), 3)) }
                      : {}),
                  });
                }}
              />
              {t(`repeat.endOptions.${end}`)}
            </label>
            {end === "until" && spec.end === "until" ? (
              <Input
                type="date"
                aria-label={t("repeat.untilDate")}
                className="w-auto"
                min={start}
                value={spec.until}
                onChange={(e) => {
                  change({ until: e.target.value });
                }}
              />
            ) : null}
            {end === "count" && spec.end === "count" ? (
              <>
                <Input
                  type="number"
                  aria-label={t("repeat.countField")}
                  min={1}
                  max={MAX_COUNT}
                  className="w-20"
                  value={numberOf(spec.count)}
                  onChange={(e) => {
                    change({ count: e.target.valueAsNumber });
                  }}
                />
                <span>{t("repeat.occurrences", { count: numberOf(spec.count) || 0 })}</span>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
