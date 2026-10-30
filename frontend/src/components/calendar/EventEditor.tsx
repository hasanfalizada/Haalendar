// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. Event editor (FR-CAL-06/07, F-10/F-11/F-13, D-64): a dialog on
// larger screens, a full-screen sheet on phones. Title (≤ 150, empty saves as "(No title)"), all day (default on),
// dates and 15-minute times in the event's own zone (named when it differs from the viewer's), repeat (a series lasts
// one day, so its end date is hidden), calendar, place, Markdown description, colour (the user's default), priority,
// and attachments once the event exists. The end may not be before the start (shown, Save blocked); moving the start
// past the end moves the end along. Saving goes through the local store (offline too) with undo; an edit sends only
// what changed with the values it started from. Typed values are kept as a draft on this device; closing with changes
// asks first; Ctrl+Enter saves. With no writable calendar yet, "My calendar" is created on the first save (until
// HAAL-094: every user has a default calendar now, D-82).
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. With `occurrence`, the editor works on a one-off copy of that date of
// the series (FR-CAL-13, D-67): nothing is written until Save, which creates the copy and excludes the date from the
// series in one undo step; Cancel leaves both untouched. The copy has no repeat and starts without attachments.
// +++===+++ 2026-10-25 — Hasan Alizada — HAAL-080. Save first looks for other active events with the same title (new
// event, or a changed title; the event itself and a copied series never count) and asks before saving a duplicate
// (D-69); "Show" closes the editor — the draft stays on this device — and opens that event.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. Reminders (FR-CAL-29, D-79): the user's own reminders of the
// event are part of the form (ReminderPicker); saving writes the removed and new ones in the same undo step as the
// event. A new event and the copy of an occurrence get the reminders of the form (the copy starts with the series').
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-092. Repeat (FR-CAL-30, D-80): presets for the start date and Custom…
// (RepeatPicker); a rule that does not fit the start is shown at the field and blocks Save.
// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-093. With `occurrence` and `following`, the editor works on the series
// from that occurrence on (FR-CAL-31, D-81): the series' fields and rule (a count lowered by the dates before). Nothing
// is written until Save, and only when something changed: the series then ends the day before and the values are
// saved as a new series (calendar free to choose, the user's reminders along, attachments stay with the earlier part),
// in one undo step.
import { useQuery } from "@tanstack/react-query";
import { type SubmitEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Color, Priority } from "@/api/generated/types.gen";
import { meQuery } from "@/api/session";
import { useSettings } from "@/api/settings";
import { runWrite } from "@/api/write";
import { Attachments } from "@/components/attachments/Attachments";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DraftNotice } from "@/components/ui/draft-notice";
import { Field, Input, Select } from "@/components/ui/input";
import { PrioritySelect } from "@/components/ui/priority";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { addDays, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { clockText, dayLabel } from "@/lib/dayView";
import { dayToShow, findDuplicates, titleKey } from "@/lib/duplicates";
import {
  type EventForm,
  LOCATION_MAX,
  TITLE_MAX,
  changesOf,
  eventData,
  followingForm,
  formFromRow,
  newEventForm,
  slotsFor,
  validate,
  withAllDay,
  withStart,
} from "@/lib/eventForm";
import { remindersOf, specsFromText, specsText } from "@/lib/reminders";
import {
  NO_REPEAT,
  type RepeatSpec,
  describeSpec,
  plainSpec,
  presetOf,
  specFromText,
  specText,
} from "@/lib/repeatRule";
import { planSplit } from "@/lib/seriesSplit";
import { batchStep, newStep } from "@/lib/undo";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { uuidv7 } from "@/lib/uuid";
import { localKeys, localRows, mutate } from "@/sync";

import { type DuplicateMatch, DuplicateWarning } from "./DuplicateWarning";
import { ReminderPicker } from "./ReminderPicker";
import { linkStep, timeBlockLink } from "./timeBlockWrites";
import { RepeatCustom, RepeatSelect } from "./RepeatPicker";
import { planSteps, writePlan } from "./moveNextDay";
import { reminderChanges } from "./reminderWrites";
import { useCalendars } from "./useCalendars";

type Row = Record<string, unknown>;

interface EventEditorProps {
  /** The day a new event starts on. */
  date: string;
  /** The event to edit; null = a new one. */
  event: Row | null;
  /** With a series: edit a one-off copy of this occurrence ("YYYY-MM-DD") instead of the series. */
  occurrence?: string;
  /** With `occurrence`: edit that occurrence and the following ones (a split of the series). */
  following?: boolean;
  onClose: () => void;
  /** "Show" in the duplicate warning: open that event on that day (the editor has closed). */
  onShowEvent?: (id: string, day: string) => void;
  /** +++===+++ 2026-10-30 — Hasan Alizada — HAAL-124. A new event's starting values ("Schedule…" of a note or card). */
  prefill?: Partial<EventForm>;
  /** A new event is linked to this item when saved (a time block, D-99). */
  linkTo?: string;
}

function nowIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(),
  );
}

// A stable empty list while the reminders load (a new [] on every render would change the form's baseline each time).
const NO_ROWS: Record<string, unknown>[] = [];

export function EventEditor({
  date,
  event,
  occurrence,
  following = false,
  onClose,
  onShowEvent,
  prefill,
  linkTo,
}: EventEditorProps) {
  const { t, i18n } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const user = me?.id ?? "";
  const settings = useSettings();
  const viewerTz = useDisplayTimeZone();
  const visibleCalendars = useCalendars(me?.id);
  const calendars = visibleCalendars.writable;
  const { data: rows = [] } = useQuery({
    queryKey: [...localKeys.table("item"), user],
    queryFn: () => (user ? localRows(user, "item") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const { data: reminderRows = NO_ROWS } = useQuery({
    queryKey: [...localKeys.table("reminder"), user],
    queryFn: () => (user ? localRows(user, "reminder") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const firstCalendar = typeof calendars[0]?.id === "string" ? calendars[0].id : "";
  const eventKey = typeof event?.id === "string" ? event.id : null;
  const existingReminders = useMemo(
    () => (eventKey ? remindersOf(reminderRows, eventKey) : []),
    [reminderRows, eventKey],
  );
  const baseline = useMemo(() => {
    const form = event
      ? following && occurrence
        ? followingForm(event, occurrence)
        : formFromRow(event, occurrence)
      : { ...newEventForm(date, settings.default_color, firstCalendar), ...prefill };
    return { ...form, reminders: specsText(existingReminders.map((reminder) => reminder.spec)) };
  }, [event, occurrence, following, date, settings.default_color, firstCalendar, existingReminders, prefill]);
  const [form, setForm] = useState<EventForm>(baseline);
  // The starting values can change after opening (the calendars arrive from the local database): an untouched form
  // follows them — adjusted while rendering, React's pattern for state derived from changed inputs.
  const [seen, setSeen] = useState(baseline);
  if (seen !== baseline) {
    if (JSON.stringify(form) === JSON.stringify(seen)) setForm(baseline);
    setSeen(baseline);
  }
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  // Custom… stays open once chosen; a stored rule that is no preset opens with it.
  const [customRepeat, setCustomRepeat] = useState(
    () => presetOf(specFromText(baseline.repeat), baseline.start_date) === "custom",
  );
  const formRef = useRef<HTMLFormElement>(null);
  const eventId = typeof event?.id === "string" ? event.id : null;
  const at = eventId !== null && occurrence !== undefined ? { series: eventId, date: occurrence } : null;
  const copyOf = following ? null : at;
  const splitAt = following ? at : null;
  // The record being edited: none for a new event, the copy of an occurrence or a split (all created on Save).
  const id = at ? null : eventId;
  const eventTz = typeof event?.tzid === "string" ? event.tzid : viewerTz;
  const today = todayIn(eventTz);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const draft = useDraft({
    scope: splitAt
      ? `event:${splitAt.series}:${splitAt.date}:following`
      : copyOf
        ? `event:${copyOf.series}:${copyOf.date}`
        : id
          ? `event:${id}`
          : "event:new",
    values: form,
    baseline,
  });
  const errors = validate(form);
  const invalid = Object.keys(errors).length > 0;
  const guard = useUnsavedGuard({
    dirty,
    hasDraft: true,
    inDialog: true,
    scope: formRef,
    onLeave: () => draft.flush(),
    onDiscard: async () => {
      await draft.discard();
    },
    onSave: () => {
      if (!busy) formRef.current?.requestSubmit();
    },
  });

  const set = (patch: Partial<EventForm>) => {
    setForm((current) => ({ ...current, ...patch }) as EventForm);
  };

  function close() {
    guard.requestClose(onClose);
  }

  async function save(): Promise<boolean> {
    // +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Every user has a default calendar (D-82): no calendar is made
    // here any more; new events start in the default one (first among the writable calendars).
    const calendarId = form.calendar_id;
    const title = form.title.trim() || t("calendar.day.noTitle");
    const wantedReminders = specsFromText(form.reminders);
    const reminderLabel = { key: "undo.labels.eventEdited", values: { title } };
    if (copyOf) {
      const newId = uuidv7();
      const values = { title, date: dayLabel(copyOf.date, i18n.language) };
      const reminders = reminderChanges(user, newId, [], wantedReminders, reminderLabel);
      const result = await runWrite({
        name: "occurrence_edit",
        run: async () => {
          await mutate(user, {
            entity_type: "item",
            entity_id: newId,
            op: "create",
            data: {
              kind: "event",
              container_kind: "calendar",
              container_id: calendarId,
              tzid: eventTz,
              ...eventData(form),
            },
          });
          const excluded = await mutate(user, {
            entity_type: "item",
            entity_id: copyOf.series,
            op: "exclude",
            data: { occurrence_date: copyOf.date, override_event_id: newId },
          });
          await reminders.run();
          return excluded;
        },
        success: t("calendar.occurrence.saved", { title }),
        undo: () =>
          batchStep({ key: "undo.labels.occurrenceEdited", values }, [
            newStep("event.create", { key: "undo.labels.eventCreated", values: { title } }, { user, id: newId }),
            newStep(
              "event.exclude",
              { key: "undo.labels.occurrenceDeleted", values },
              { user, id: copyOf.series, date: copyOf.date },
            ),
            ...reminders.steps,
          ]),
      });
      return result.ok;
    }
    if (splitAt && event) {
      if (!dirty) return true;
      const newId = uuidv7();
      const values = { title, date: dayLabel(splitAt.date, i18n.language) };
      const plan = planSplit(event, splitAt.date, {
        kind: "event",
        container_kind: "calendar",
        container_id: calendarId,
        tzid: eventTz,
        ...eventData(form),
      });
      const reminders = reminderChanges(user, newId, [], wantedReminders, reminderLabel);
      const result = await runWrite({
        name: "series_split",
        run: async () => {
          const written = await writePlan(user, plan, newId);
          await reminders.run();
          return written;
        },
        // A repeat would split the series once more.
        retry: false,
        success: t("calendar.occurrence.followingSaved", values),
        undo: () =>
          batchStep({ key: "undo.labels.followingEdited", values }, [
            ...planSteps(user, plan, newId, title),
            ...reminders.steps,
          ]),
      });
      return result.ok;
    }
    if (!event || !id) {
      const newId = uuidv7();
      const reminders = reminderChanges(user, newId, [], wantedReminders, reminderLabel);
      const created = { key: "undo.labels.eventCreated", values: { title } };
      const link = linkTo ? timeBlockLink(newId, linkTo) : null;
      const result = await runWrite({
        name: "event_create",
        run: async () => {
          const written = await mutate(user, {
            entity_type: "item",
            entity_id: newId,
            op: "create",
            // The zone is sent too (the server would take the profile zone as well), so the event is placed in the
            // day view at once, before the server has answered.
            data: {
              kind: "event",
              container_kind: "calendar",
              container_id: calendarId,
              tzid: me?.time_zone ?? viewerTz,
              ...eventData(form),
            },
          });
          await reminders.run();
          if (link) await link.write(user, link.id);
          return written;
        },
        success: t("calendar.editor.created", { title }),
        undo: () => {
          const step = newStep("event.create", created, { user, id: newId });
          const steps = [step, ...reminders.steps, ...(link ? [linkStep(created, user, link.id)] : [])];
          return steps.length > 1 ? batchStep(created, steps) : step;
        },
      });
      return result.ok;
    }
    const { data, base, moveTo } = changesOf(event, form);
    const reminders = reminderChanges(user, id, existingReminders, wantedReminders, reminderLabel);
    const fields = Object.keys(data).length > 0;
    let ok = true;
    if (fields || reminders.count > 0) {
      const version = typeof event.version === "number" ? { base_version: event.version } : {};
      const edited = { key: "undo.labels.eventEdited", values: { title } };
      const result = await runWrite({
        name: "event_update",
        run: async () => {
          if (fields) await mutate(user, { entity_type: "item", entity_id: id, op: "update", ...version, base, data });
          await reminders.run();
          return { data: true };
        },
        success: t("calendar.editor.saved", { title }),
        undo: () => {
          const steps = [
            ...(fields ? [newStep("event.update", edited, { user, id, before: base, after: data })] : []),
            ...reminders.steps,
          ];
          return steps.length === 1 && steps[0] ? steps[0] : batchStep(edited, steps);
        },
      });
      ok = result.ok;
    }
    if (ok && moveTo) {
      const result = await runWrite({
        name: "event_move",
        run: () =>
          mutate(user, {
            entity_type: "item",
            entity_id: id,
            op: "move",
            base: { container_kind: "calendar", container_id: event.container_id },
            data: { container_kind: "calendar", container_id: moveTo },
          }),
        success: t("calendar.editor.saved", { title }),
      });
      ok = result.ok;
    }
    return ok;
  }

  /** Other events with the title being saved — only for a new event or a changed title. */
  function duplicatesOf(): DuplicateMatch[] {
    const unchanged = event !== null && titleKey(form.title) === titleKey(event.title);
    if (unchanged) return [];
    return findDuplicates(rows, form.title, eventId ? [eventId] : []).map((row) => {
      const calendar = visibleCalendars.byId.get(String(row.container_id));
      return {
        id: String(row.id),
        title: typeof row.title === "string" ? row.title : "",
        day: dayToShow(row, todayIn(viewerTz), viewerTz),
        calendarName: typeof calendar?.name === "string" ? calendar.name : null,
      };
    });
  }

  async function onSubmit(submitted: SubmitEvent<HTMLFormElement>) {
    submitted.preventDefault();
    setTouched(true);
    if (invalid || busy) return;
    const found = duplicatesOf();
    if (found.length > 0) {
      setDuplicates(found);
      return;
    }
    await commitSave();
  }

  async function commitSave() {
    setBusy(true);
    await draft.flush();
    const ok = await save();
    setBusy(false);
    if (ok) {
      await draft.commit();
      onClose();
    }
  }

  const timed = form.all_day === "false";
  const series = form.repeat !== NO_REPEAT;
  const repeatSpec = specFromText(form.repeat);
  const showCustom = customRepeat || presetOf(repeatSpec, form.start_date) === "custom";
  /** A new rule (and the start it needs); a series lasts one day. */
  const setRepeat = (spec: RepeatSpec | null, start?: string) => {
    setForm((current) => {
      const next = { ...current, repeat: specText(spec) };
      const moved = start ? withStart(next, { start_date: start }) : next;
      return spec ? { ...moved, end_date: moved.start_date } : moved;
    });
  };
  const timeLabel = (value: string) => clockText(value, i18n.language, settings.time_format);
  const timeSelect = (field: "start_time" | "end_time", label: string, error?: string) => (
    <Field id={`event-${field}`} label={label} error={error}>
      {(aria) => (
        <Select
          {...aria}
          value={form[field]}
          onChange={(e) => {
            if (field === "start_time") setForm((current) => withStart(current, { start_time: e.target.value }));
            else set({ end_time: e.target.value });
          }}
        >
          {slotsFor(form[field]).map((slot) => (
            <option key={slot} value={slot}>
              {timeLabel(slot)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  const endError =
    touched || form.end_date !== baseline.end_date || form.end_time !== baseline.end_time
      ? errors.end && t("calendar.editor.endBeforeStart")
      : undefined;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        title={
          splitAt
            ? t("calendar.occurrence.followingEditorTitle", { date: dayLabel(splitAt.date, i18n.language) })
            : copyOf
              ? t("calendar.occurrence.editorTitle", { date: dayLabel(copyOf.date, i18n.language) })
              : t(event ? "calendar.editor.editTitle" : "calendar.editor.newTitle")
        }
        closeLabel={t("common.close")}
        className="max-md:top-0 max-md:max-h-dvh max-md:rounded-none md:max-w-2xl"
      >
        <DraftNotice
          draft={draft.pending}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) setForm(restored);
          }}
          onDiscard={() => void draft.discard()}
        />
        <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          <Field
            id="event-title"
            label={t("calendar.editor.title")}
            hint={t("calendar.editor.titleHint", { count: form.title.length, max: TITLE_MAX })}
            error={errors.title && t("calendar.editor.tooLong", { max: TITLE_MAX })}
          >
            {(aria) => (
              <Input
                {...aria}
                autoFocus
                value={form.title}
                placeholder={t("calendar.day.noTitle")}
                maxLength={TITLE_MAX}
                onChange={(e) => {
                  set({ title: e.target.value });
                }}
              />
            )}
          </Field>

          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={!timed}
              onChange={(e) => {
                setForm((current) => withAllDay(current, e.target.checked, today, nowIn(eventTz)));
              }}
            />
            {t("calendar.editor.allDay")}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="event-start-date" label={t("calendar.editor.startDate")}>
              {(aria) => (
                <Input
                  {...aria}
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) => {
                    if (e.target.value) setForm((current) => withStart(current, { start_date: e.target.value }));
                  }}
                />
              )}
            </Field>
            {timed ? timeSelect("start_time", t("calendar.editor.startTime")) : null}
            {!series ? (
              <Field id="event-end-date" label={t("calendar.editor.endDate")} error={timed ? undefined : endError}>
                {(aria) => (
                  <Input
                    {...aria}
                    type="date"
                    required
                    min={form.start_date}
                    value={form.end_date}
                    onChange={(e) => {
                      if (e.target.value) set({ end_date: e.target.value });
                    }}
                  />
                )}
              </Field>
            ) : null}
            {timed ? timeSelect("end_time", t("calendar.editor.endTime"), endError) : null}
          </div>
          {event && eventTz !== viewerTz ? (
            <p className="text-xs text-muted">{t("calendar.editor.zoneNote", { zone: eventTz })}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {copyOf ? null : (
              <Field
                id="event-repeat"
                label={t("calendar.editor.repeat")}
                hint={
                  series ? (
                    <>
                      {showCustom && repeatSpec && !errors.repeat ? (
                        <span className="block font-medium text-fg">{describeSpec(repeatSpec, form.start_date)}</span>
                      ) : null}
                      {t("calendar.editor.repeatHint")}
                    </>
                  ) : undefined
                }
                error={errors.repeat && t(`repeat.problems.${errors.repeat}`)}
              >
                {(aria) => (
                  <RepeatSelect
                    aria={aria}
                    spec={repeatSpec}
                    start={form.start_date}
                    custom={showCustom}
                    onPreset={(spec) => {
                      setCustomRepeat(false);
                      setRepeat(spec);
                    }}
                    onCustom={() => {
                      setCustomRepeat(true);
                      setRepeat(repeatSpec ?? plainSpec("weekly"));
                    }}
                  />
                )}
              </Field>
            )}
            {/* The copy stays in the series' calendar (the server checks it). */}
            {copyOf ? null : (
              <Field id="event-calendar" label={t("calendar.editor.calendar")}>
                {(aria) => (
                  <Select
                    {...aria}
                    value={form.calendar_id}
                    onChange={(e) => {
                      set({ calendar_id: e.target.value });
                    }}
                  >
                    {calendars.map((calendar) => (
                      <option key={String(calendar.id)} value={String(calendar.id)}>
                        {String(calendar.name)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>

          {!copyOf && showCustom && repeatSpec ? (
            <RepeatCustom
              spec={repeatSpec}
              start={form.start_date}
              weekStart={settings.week_start}
              onChange={setRepeat}
            />
          ) : null}

          <ReminderPicker
            value={specsFromText(form.reminders)}
            allDay={form.all_day === "true"}
            onChange={(next) => {
              set({ reminders: specsText(next) });
            }}
          />

          <Field
            id="event-location"
            label={t("calendar.editor.location")}
            error={errors.location && t("calendar.editor.tooLong", { max: LOCATION_MAX })}
          >
            {(aria) => (
              <Input
                {...aria}
                value={form.location}
                maxLength={LOCATION_MAX}
                onChange={(e) => {
                  set({ location: e.target.value });
                }}
              />
            )}
          </Field>

          <MarkdownEditor
            id="event-body"
            label={t("calendar.editor.description")}
            value={form.body}
            rows={4}
            onChange={(body) => {
              set({ body });
            }}
          />

          <ColorPicker
            name="event-color"
            legend={t("calendar.editor.color")}
            value={form.color as Color}
            onChange={(color) => {
              set({ color });
            }}
          />
          {/* The priority picker brings its own legend. */}
          <PrioritySelect
            name="event-priority"
            value={form.priority as Priority}
            onChange={(priority) => {
              set({ priority });
            }}
          />

          {splitAt ? (
            <p className="text-xs text-muted">
              {t("calendar.occurrence.followingNote", {
                date: dayLabel(splitAt.date, i18n.language),
                previous: dayLabel(addDays(splitAt.date, -1), i18n.language),
              })}
            </p>
          ) : copyOf ? (
            <p className="text-xs text-muted">
              {t("calendar.occurrence.copyNote", { date: dayLabel(copyOf.date, i18n.language) })}
            </p>
          ) : id ? (
            <Attachments itemId={id} editable />
          ) : (
            <p className="text-xs text-muted">{t("calendar.editor.attachmentsLater")}</p>
          )}

          <DialogFooter>
            <Button onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={busy || invalid || !form.calendar_id}>
              {t("calendar.editor.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <UnsavedChangesDialog prompt={guard.prompt} />
      <DuplicateWarning
        open={duplicates !== null}
        matches={duplicates ?? []}
        onBack={() => {
          setDuplicates(null);
        }}
        onSaveAnyway={async () => {
          setDuplicates(null);
          await commitSave();
        }}
        onShow={(match) => {
          setDuplicates(null);
          // Leaving on purpose: the draft is written and the unsaved-changes guard holds nothing any more.
          void guard.leave().then(() => {
            onClose();
            if (match.day) onShowEvent?.(match.id, match.day);
          });
        }}
      />
    </Dialog>
  );
}
