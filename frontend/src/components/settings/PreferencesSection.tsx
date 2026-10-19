// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. Preferences in Settings (FR-ACC-09, FR-CAL-23/27, D-50): theme, week
// start, 12/24-hour time, default color for new items, agenda range and Week A/B (on/off, a date of a week labelled
// first, the two labels) with a preview of this and next week's label. One form saved with If-Match like the profile:
// unsaved-changes guard, local draft, Ctrl/Cmd+Enter. The theme is shown at once as a preview and stored on Save;
// leaving without saving brings the saved theme back. Settings are stored on the server and follow the user to
// every device; changing them needs a connection (offline editing arrives with HAAL-052).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateSettings } from "@/api/generated/sdk.gen";
import type { Color, Settings, SettingsPatch } from "@/api/generated/types.gen";
import { settingsQuery, settingsQueryKey } from "@/api/settings";
import { runWrite } from "@/api/write";
import { labelWeek } from "@/atoms/calendar/weekAbLabel";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { DraftNotice } from "@/components/ui/draft-notice";
import { Field, Input, Select } from "@/components/ui/input";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { addDays, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemePreference } from "@/theme/theme";

type Theme = Settings["theme"];
type TimeFormat = Settings["time_format"];

const THEMES: { value: Theme; labelKey: `pages.settings.theme${"System" | "Light" | "Dark"}` }[] = [
  { value: "system", labelKey: "pages.settings.themeSystem" },
  { value: "light", labelKey: "pages.settings.themeLight" },
  { value: "dark", labelKey: "pages.settings.themeDark" },
];
const TIME_FORMATS: readonly TimeFormat[] = ["24h", "12h"];
const LABEL_MAX = 10;
const SAMPLE_TIME = new Date(Date.UTC(2026, 0, 5, 14, 30));

/** Form values as strings (they are also the local draft). */
interface Values extends Record<string, string> {
  theme: Theme;
  week_start: string;
  time_format: TimeFormat;
  default_color: Color;
  agenda_days: string;
  week_ab_enabled: "true" | "false";
  week_ab_anchor: string;
  week_ab_label_a: string;
  week_ab_label_b: string;
}

type Errors = Partial<Record<"agenda_days" | "week_ab_anchor" | "week_ab_label_a" | "week_ab_label_b", string>>;

function valuesOf(settings: Settings): Values {
  return {
    theme: settings.theme,
    week_start: String(settings.week_start),
    time_format: settings.time_format,
    default_color: settings.default_color,
    agenda_days: String(settings.agenda_days),
    week_ab_enabled: settings.week_ab.enabled ? "true" : "false",
    week_ab_anchor: settings.week_ab.anchor ?? "",
    week_ab_label_a: settings.week_ab.labels?.[0] ?? "A",
    week_ab_label_b: settings.week_ab.labels?.[1] ?? "B",
  };
}

/** Only what changed, as a JSON merge patch. */
function patchOf(values: Values, saved: Values): SettingsPatch {
  const patch: SettingsPatch = {};
  if (values.theme !== saved.theme) patch.theme = values.theme;
  if (values.week_start !== saved.week_start) patch.week_start = Number(values.week_start);
  if (values.time_format !== saved.time_format) patch.time_format = values.time_format;
  if (values.default_color !== saved.default_color) patch.default_color = values.default_color;
  if (values.agenda_days !== saved.agenda_days) patch.agenda_days = Number(values.agenda_days);
  const weekAb: NonNullable<SettingsPatch["week_ab"]> = {};
  if (values.week_ab_enabled !== saved.week_ab_enabled) weekAb.enabled = values.week_ab_enabled === "true";
  if (values.week_ab_anchor && values.week_ab_anchor !== saved.week_ab_anchor) weekAb.anchor = values.week_ab_anchor;
  const labels: [string, string] = [values.week_ab_label_a.trim(), values.week_ab_label_b.trim()];
  if (labels[0] !== saved.week_ab_label_a || labels[1] !== saved.week_ab_label_b) weekAb.labels = labels;
  if (Object.keys(weekAb).length > 0) patch.week_ab = weekAb;
  return patch;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; text: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-[13px] font-medium">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="inline-flex w-fit overflow-hidden rounded-sm border border-line"
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => {
                onChange(option.value);
              }}
              className={cn(
                "h-11 border-r border-line px-4 text-[13px] last:border-r-0 md:h-8",
                checked ? "bg-primary-tint font-semibold text-primary" : "hover:bg-surface",
              )}
            >
              {option.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PreferencesSection() {
  const { t } = useTranslation();
  const { data: settings, isError } = useQuery(settingsQuery);
  return (
    <section
      id="preferences"
      tabIndex={-1}
      aria-labelledby="preferences-title"
      className="flex scroll-mt-2 flex-col gap-4 p-4 outline-none"
    >
      <h2 id="preferences-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("preferences.title")}
      </h2>
      {settings ? (
        // The form is re-created for every new settings version (fresh field values).
        <PreferencesForm key={settings.version} settings={settings} />
      ) : isError ? (
        <p className="text-[13px] text-muted">{t("preferences.unavailable")}</p>
      ) : null}
    </section>
  );
}

function PreferencesForm({ settings }: { settings: Settings }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { setPreference, setPreview } = useTheme();
  const timeZone = useDisplayTimeZone();
  const form = useRef<HTMLFormElement>(null);
  const saved = useMemo(() => valuesOf(settings), [settings]);
  const [values, setValues] = useState<Values>(saved);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const dirty = Object.keys(patchOf(values, saved)).length > 0;

  const draft = useDraft({ scope: "settings", values, baseline: saved });
  const guard = useUnsavedGuard({
    dirty,
    hasDraft: true,
    onLeave: () => draft.flush(),
    onDiscard: async () => {
      await draft.discard();
      setValues(saved);
      setPreview(null);
    },
    scope: form,
    onSave: () => {
      if (dirty && !busy) form.current?.requestSubmit();
    },
  });

  // The theme preview ends with the form (saved, left or replaced by a newer version).
  useEffect(
    () => () => {
      setPreview(null);
    },
    [setPreview],
  );

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "theme") setPreview(value as ThemePreference);
  }

  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { weekday: "long", timeZone: "UTC" });
    // 2023-01-01 was a Sunday: index = contract value (0 = Sunday … 6 = Saturday).
    return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2023, 0, 1 + day))));
  }, [i18n.language]);

  const sample = (format: TimeFormat) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      hourCycle: format === "12h" ? "h12" : "h23",
    }).format(SAMPLE_TIME);

  const preview = useMemo(() => {
    if (values.week_ab_enabled !== "true" || !values.week_ab_anchor) return null;
    const labels = [values.week_ab_label_a.trim(), values.week_ab_label_b.trim()] as const;
    if (!labels[0] || !labels[1]) return null;
    try {
      const today = todayIn(timeZone);
      const input = { anchor: values.week_ab_anchor, week_start: Number(values.week_start), labels };
      return {
        current: labelWeek({ ...input, date: today }).label,
        next: labelWeek({ ...input, date: addDays(today, 7) }).label,
      };
    } catch {
      return null; // identical labels: reported by validation
    }
  }, [values, timeZone]);

  function validate(): Errors {
    const found: Errors = {};
    const agenda = Number(values.agenda_days);
    if (!Number.isInteger(agenda) || agenda < 1 || agenda > 365) found.agenda_days = t("preferences.agendaInvalid");
    if (values.week_ab_enabled === "true" && !values.week_ab_anchor) {
      found.week_ab_anchor = t("preferences.weekAb.anchorRequired");
    }
    const a = values.week_ab_label_a.trim();
    const b = values.week_ab_label_b.trim();
    if (!a) found.week_ab_label_a = t("auth.required");
    if (!b) found.week_ab_label_b = t("auth.required");
    if (a && b && a.toLocaleLowerCase("en") === b.toLocaleLowerCase("en")) {
      found.week_ab_label_b = t("preferences.weekAb.labelsDistinct");
    }
    return found;
  }

  async function onSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    await draft.flush();
    const result = await runWrite({
      name: "settings_save",
      run: () =>
        updateSettings({ headers: { "If-Match": `"${String(settings.version)}"` }, body: patchOf(values, saved) }),
      success: t("preferences.saved"),
      draft: true,
      reasons: (problem) => (problem.code === "version_conflict" ? t("preferences.conflict") : null),
      onFieldErrors: (fieldErrors) => {
        const mapped: Errors = {};
        for (const { field, detail } of fieldErrors) {
          if (field === "agenda_days") mapped.agenda_days = detail;
          else if (field === "week_ab/anchor") mapped.week_ab_anchor = detail;
          else if (field === "week_ab/labels/0") mapped.week_ab_label_a = detail;
          else if (field.startsWith("week_ab/labels")) mapped.week_ab_label_b = detail;
        }
        setErrors(mapped);
      },
      onSuccess: async (updated) => {
        await draft.commit();
        setPreference(updated.theme);
        setPreview(null);
        queryClient.setQueryData(settingsQueryKey, updated);
      },
    });
    setBusy(false);
    // The newer version replaces the form; the draft brings the edits back (DraftNotice).
    if (!result.ok && result.code === "version_conflict") {
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    }
  }

  const enabled = values.week_ab_enabled === "true";
  return (
    <>
      <DraftNotice
        draft={draft.pending}
        onRestore={() => {
          const fields = draft.restore();
          if (fields) {
            setValues({ ...saved, ...fields });
            setPreview(fields.theme);
          }
        }}
        onDiscard={() => void draft.discard()}
      />
      <form ref={form} onSubmit={(e) => void onSave(e)} noValidate className="flex max-w-md flex-col gap-5">
        <Segmented
          label={t("pages.settings.theme")}
          options={THEMES.map((o) => ({ value: o.value, text: t(o.labelKey) }))}
          value={values.theme}
          onChange={(value) => {
            set("theme", value);
          }}
        />
        <Segmented
          label={t("preferences.timeFormat")}
          options={TIME_FORMATS.map((format) => ({
            value: format,
            text: t(`preferences.timeFormats.${format}`, { sample: sample(format) }),
          }))}
          value={values.time_format}
          onChange={(value) => {
            set("time_format", value);
          }}
        />
        <Field id="pref-week-start" label={t("preferences.weekStart")}>
          {(aria) => (
            <Select
              {...aria}
              value={values.week_start}
              onChange={(e) => {
                set("week_start", e.target.value);
              }}
            >
              {weekdays.map((name, day) => (
                <option key={name} value={String(day)}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ColorPicker
          name="pref-default-color"
          legend={t("preferences.defaultColor")}
          value={values.default_color}
          onChange={(color) => {
            set("default_color", color);
          }}
        />
        <Field
          id="pref-agenda"
          label={t("preferences.agendaDays")}
          hint={t("preferences.agendaHint")}
          error={errors.agenda_days}
        >
          {(aria) => (
            <Input
              {...aria}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              className="w-28"
              value={values.agenda_days}
              onChange={(e) => {
                set("agenda_days", e.target.value);
              }}
            />
          )}
        </Field>

        <fieldset className="flex flex-col gap-3 rounded-sm border border-line p-3">
          <legend className="px-1 text-[13px] font-medium">{t("preferences.weekAb.title")}</legend>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                set("week_ab_enabled", e.target.checked ? "true" : "false");
              }}
            />
            {t("preferences.weekAb.enable")}
          </label>
          <p className="text-xs text-muted">{t("preferences.weekAb.explain")}</p>
          <Field
            id="pref-week-ab-anchor"
            label={t("preferences.weekAb.anchor", { label: values.week_ab_label_a.trim() || "A" })}
            hint={t("preferences.weekAb.anchorHint")}
            error={errors.week_ab_anchor}
          >
            {(aria) => (
              <Input
                {...aria}
                type="date"
                className="w-44"
                value={values.week_ab_anchor}
                onChange={(e) => {
                  set("week_ab_anchor", e.target.value);
                }}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-3">
            <Field id="pref-week-ab-a" label={t("preferences.weekAb.labelFirst")} error={errors.week_ab_label_a}>
              {(aria) => (
                <Input
                  {...aria}
                  maxLength={LABEL_MAX}
                  className="w-28"
                  value={values.week_ab_label_a}
                  onChange={(e) => {
                    set("week_ab_label_a", e.target.value);
                  }}
                />
              )}
            </Field>
            <Field id="pref-week-ab-b" label={t("preferences.weekAb.labelSecond")} error={errors.week_ab_label_b}>
              {(aria) => (
                <Input
                  {...aria}
                  maxLength={LABEL_MAX}
                  className="w-28"
                  value={values.week_ab_label_b}
                  onChange={(e) => {
                    set("week_ab_label_b", e.target.value);
                  }}
                />
              )}
            </Field>
          </div>
          {preview ? (
            <p className="text-[13px]" role="status">
              {t("preferences.weekAb.preview", { current: preview.current, next: preview.next })}
            </p>
          ) : null}
        </fieldset>

        <Button type="submit" variant="primary" className="w-fit" disabled={busy || !dirty}>
          {t("preferences.save")}
        </Button>
      </form>
      <UnsavedChangesDialog prompt={guard.prompt} />
    </>
  );
}
