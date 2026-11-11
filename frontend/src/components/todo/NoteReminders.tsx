// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-105. The reminders of a note in its editor (FR-TODO-07, D-89): each is a
// date and time in the reader's zone ("Tomorrow, 09:00"), a passed one greyed with "passed" until it is removed; a date
// and a time field with Add reminder (a time still ahead, at most 5, no duplicate). Nothing is written here — the
// editor's Save does, with the note, in one undo step.
import { BellPlus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { todayIn, useDisplayTimeZone } from "@/lib/datetime";
import {
  MAX_REMINDERS,
  type ReminderSpec,
  atFromLocal,
  atLabel,
  isAt,
  localParts,
  sortSpecs,
  specKey,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

interface NoteRemindersProps {
  value: readonly ReminderSpec[];
  onChange: (next: ReminderSpec[]) => void;
}

/** The next whole hour from now in the zone: the time the fields start with. */
function nextHour(timeZone: string): { day: string; time: string } {
  return localParts(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000, timeZone);
}

export function NoteReminders({ value, onChange }: NoteRemindersProps) {
  const { t } = useTranslation();
  const viewerTz = useDisplayTimeZone();
  const { time_format: timeFormat } = useSettings();
  const [start] = useState(() => nextHour(viewerTz));
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [problem, setProblem] = useState<string | null>(null);
  // While the editor is open: which reminders show as passed.
  const [now] = useState(() => Date.now());
  const reminders = sortSpecs(value).filter(isAt);
  const full = value.length >= MAX_REMINDERS;

  function add() {
    const at = atFromLocal(day, time, viewerTz);
    if (!at || Date.parse(at) <= Date.now()) {
      setProblem(t("todo.reminders.inPast"));
      return;
    }
    const spec = { remind_at: at };
    if (value.some((other) => specKey(other) === specKey(spec))) {
      setProblem(t("todo.reminders.duplicate"));
      return;
    }
    setProblem(null);
    onChange([...value, spec]);
  }

  return (
    <section aria-labelledby="note-reminders" className="flex flex-col gap-2">
      <h3 id="note-reminders" className="text-[13px] font-medium">
        {t("todo.reminders.title")}
      </h3>
      {reminders.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {reminders.map((spec) => {
            const label = atLabel(spec.remind_at, viewerTz, timeFormat, now);
            const passed = Date.parse(spec.remind_at) <= now;
            return (
              <li key={specKey(spec)} className={cn("flex items-center gap-2 text-[13px]", passed && "text-muted")}>
                <span className={cn(passed && "line-through")}>{label}</span>
                {passed ? <span className="text-xs">({t("todo.reminders.passed")})</span> : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("todo.reminders.remove", { when: label })}
                  onClick={() => {
                    onChange(value.filter((other) => specKey(other) !== specKey(spec)));
                  }}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">{t("todo.reminders.none")}</p>
      )}
      {full ? (
        <p className="text-xs text-muted">{t("todo.reminders.full", { max: MAX_REMINDERS })}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field id="note-reminder-date" label={t("todo.reminders.date")}>
            {(aria) => (
              <Input
                {...aria}
                type="date"
                value={day}
                min={todayIn(viewerTz)}
                onChange={(e) => {
                  setDay(e.target.value);
                  setProblem(null);
                }}
              />
            )}
          </Field>
          <Field id="note-reminder-time" label={t("todo.reminders.time")} error={problem ?? undefined}>
            {(aria) => (
              <Input
                {...aria}
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  setProblem(null);
                }}
              />
            )}
          </Field>
          <Button onClick={add} disabled={!day || !time}>
            <BellPlus aria-hidden />
            {t("todo.reminders.add")}
          </Button>
        </div>
      )}
    </section>
  );
}
