// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. The editor's reminders (FR-CAL-29, D-79): the chosen ones as a list
// with a remove button each, "Add reminder" with the presets of the event's kind (timed: at the start … 1 week before;
// all-day: on the day / 1, 2, 7 days before at 09:00) and "Custom…": an amount and a unit (minutes, hours, days, weeks
// before) or, for all-day events, days before and a time. At most MAX_REMINDERS; a reminder already chosen is not
// offered again. Reminders are personal — the note says so.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091 (stage 2). With reminders chosen and browser notifications off on this
// device, an offer to turn them on (the browser asks for permission on that click); "Not now" is remembered per user.
// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Also for cards (D-94): "at the start" can be named otherwise ("At the
// due time"), and adding can be off with a hint (a card without a due date) while the chosen ones stay removable.
import { useQuery } from "@tanstack/react-query";
import { Bell, BellRing, X } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { meQuery } from "@/api/session";
import { useSettings } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { clockText } from "@/lib/dayView";
import { QUARTERS } from "@/lib/eventForm";
import {
  ALL_DAY_PRESETS,
  MAX_DAYS_BEFORE,
  MAX_OFFSET_MINUTES,
  MAX_REMINDERS,
  type ReminderSpec,
  TIMED_PRESETS,
  reminderLabel,
  sortSpecs,
  specKey,
} from "@/lib/reminders";
import { usePush } from "@/lib/usePush";

const UNITS = { minutes: 1, hours: 60, days: 1440, weeks: 10080 } as const;

const offerKey = (user: string) => `haalendar.push.offer.${user}`;

function offerDismissed(user: string): boolean {
  try {
    return window.localStorage.getItem(offerKey(user)) === "dismissed";
  } catch {
    return false;
  }
}

function PushOffer() {
  const { t } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const push = usePush(me?.id);
  const [dismissed, setDismissed] = useState(() => (me ? offerDismissed(me.id) : true));
  if (!me || dismissed || push.state !== "off") return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm bg-primary-tint/50 p-2 text-[13px]">
      <BellRing className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">{t("push.offer")}</span>
      <Button variant="primary" disabled={push.busy} onClick={() => void push.enable()}>
        {t(push.busy ? "push.turningOn" : "push.turnOn")}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          try {
            window.localStorage.setItem(offerKey(me.id), "dismissed");
          } catch {
            // Blocked storage: the offer comes back next time.
          }
          setDismissed(true);
        }}
      >
        {t("push.notNow")}
      </Button>
    </div>
  );
}
type Unit = keyof typeof UNITS;
const CUSTOM = "custom";

interface ReminderPickerProps {
  value: readonly ReminderSpec[];
  allDay: boolean;
  onChange: (next: ReminderSpec[]) => void;
  /** The name of "0 minutes before" (default "At the start"). */
  startLabel?: string;
  /** Adding is off and this says why (the chosen reminders can still be removed). */
  noAdd?: string;
}

export function ReminderPicker({ value, allDay, onChange, startLabel, noAdd }: ReminderPickerProps) {
  const { t, i18n } = useTranslation();
  const { time_format: timeFormat } = useSettings();
  const labelId = useId();
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState<Unit>("hours");
  const [daysBefore, setDaysBefore] = useState("1");
  const [time, setTime] = useState("09:00");
  const chosen = new Set(value.map(specKey));
  const full = value.length >= MAX_REMINDERS;
  const presets = (allDay ? ALL_DAY_PRESETS : TIMED_PRESETS).filter((spec) => !chosen.has(specKey(spec)));
  const label = (spec: ReminderSpec) =>
    startLabel !== undefined && "offset_minutes" in spec && spec.offset_minutes === 0
      ? startLabel
      : reminderLabel(spec, timeFormat);

  const add = (spec: ReminderSpec) => {
    if (chosen.has(specKey(spec)) || full) return;
    onChange(sortSpecs([...value, spec]));
  };
  const customSpec = (): ReminderSpec | null => {
    if (allDay) {
      const days = Number(daysBefore);
      return Number.isInteger(days) && days >= 0 && days <= MAX_DAYS_BEFORE
        ? { all_day_time: time, all_day_days_before: days }
        : null;
    }
    const minutes = Number(amount) * UNITS[unit];
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_OFFSET_MINUTES
      ? { offset_minutes: minutes }
      : null;
  };
  const pending = custom ? customSpec() : null;

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-[13px] font-medium">
        {t("reminders.title")}
      </span>
      {value.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {value.map((spec) => (
            <li key={specKey(spec)} className="flex items-center gap-2 text-[13px]">
              <Bell className="size-3.5 text-muted" aria-hidden />
              <span className="flex-1">{label(spec)}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("reminders.remove", { label: label(spec) })}
                onClick={() => {
                  onChange(value.filter((other) => specKey(other) !== specKey(spec)));
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {noAdd !== undefined ? (
        <p className="text-xs text-muted">{noAdd}</p>
      ) : full ? (
        <p className="text-xs text-muted">{t("reminders.limit", { count: MAX_REMINDERS })}</p>
      ) : custom ? (
        <div className="flex flex-wrap items-end gap-2">
          {allDay ? (
            <>
              <Input
                type="number"
                min={0}
                max={MAX_DAYS_BEFORE}
                aria-label={t("reminders.daysBeforeField")}
                className="w-20"
                value={daysBefore}
                onChange={(e) => {
                  setDaysBefore(e.target.value);
                }}
              />
              <Select
                aria-label={t("reminders.timeField")}
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                }}
              >
                {QUARTERS.map((slot) => (
                  <option key={slot} value={slot}>
                    {clockText(slot, i18n.language, timeFormat)}
                  </option>
                ))}
              </Select>
            </>
          ) : (
            <>
              <Input
                type="number"
                min={0}
                aria-label={t("reminders.amount")}
                className="w-20"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
              />
              <Select
                aria-label={t("reminders.unit")}
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as Unit);
                }}
              >
                {(Object.keys(UNITS) as Unit[]).map((option) => (
                  <option key={option} value={option}>
                    {t(`reminders.units.${option}`)}
                  </option>
                ))}
              </Select>
            </>
          )}
          <Button
            disabled={pending === null || chosen.has(specKey(pending))}
            onClick={() => {
              if (pending) add(pending);
              setCustom(false);
            }}
          >
            {t("reminders.addCustom")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setCustom(false);
            }}
          >
            {t("reminders.cancelCustom")}
          </Button>
        </div>
      ) : (
        <Select
          aria-label={t("reminders.add")}
          value=""
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              return;
            }
            const spec = presets.find((option) => specKey(option) === e.target.value);
            if (spec) add(spec);
          }}
        >
          <option value="">{t("reminders.add")}</option>
          {presets.map((spec) => (
            <option key={specKey(spec)} value={specKey(spec)}>
              {label(spec)}
            </option>
          ))}
          <option value={CUSTOM}>{t("reminders.custom")}</option>
        </Select>
      )}
      <p className="text-xs text-muted">{t("reminders.personal")}</p>
      {value.length > 0 ? <PushOffer /> : null}
    </div>
  );
}
