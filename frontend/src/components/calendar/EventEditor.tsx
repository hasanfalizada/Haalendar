// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-063. Event editor (FR-CAL-06/07, F-10/F-11/F-13, D-64): a dialog on
// larger screens, a full-screen sheet on phones. Title (≤ 150, empty saves as "(No title)"), all day (default on),
// dates and 15-minute times in the event's own zone (named when it differs from the viewer's), repeat (a series lasts
// one day, so its end date is hidden), calendar, place, Markdown description, colour (the user's default), priority,
// and attachments once the event exists. The end may not be before the start (shown, Save blocked); moving the start
// past the end moves the end along. Saving goes through the local store (offline too) with undo; an edit sends only
// what changed with the values it started from. Typed values are kept as a draft on this device; closing with changes
// asks first; Ctrl+Enter saves. With no writable calendar yet, "My calendar" is created on the first save.
// +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. With `occurrence`, the editor works on a one-off copy of that date of
// the series (FR-CAL-13, D-67): nothing is written until Save, which creates the copy and excludes the date from the
// series in one undo step; Cancel leaves both untouched. The copy has no repeat and starts without attachments.
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
import { todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { clockText, dayLabel } from "@/lib/dayView";
import {
  type EventForm,
  LOCATION_MAX,
  REPEATS,
  type Repeat,
  TITLE_MAX,
  changesOf,
  eventData,
  formFromRow,
  newEventForm,
  slotsFor,
  validate,
  withAllDay,
  withStart,
} from "@/lib/eventForm";
import { log } from "@/lib/log";
import { batchStep, newStep } from "@/lib/undo";
import { useDraft } from "@/lib/useDraft";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { uuidv7 } from "@/lib/uuid";
import { mutate } from "@/sync";

import { useCalendars } from "./useCalendars";

type Row = Record<string, unknown>;

interface EventEditorProps {
  /** The day a new event starts on. */
  date: string;
  /** The event to edit; null = a new one. */
  event: Row | null;
  /** With a series: edit a one-off copy of this occurrence ("YYYY-MM-DD") instead of the series. */
  occurrence?: string;
  onClose: () => void;
}

function nowIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(),
  );
}

export function EventEditor({ date, event, occurrence, onClose }: EventEditorProps) {
  const { t, i18n } = useTranslation();
  const { data: me } = useQuery(meQuery);
  const user = me?.id ?? "";
  const settings = useSettings();
  const viewerTz = useDisplayTimeZone();
  const calendars = useCalendars(me?.id).writable;
  const firstCalendar = typeof calendars[0]?.id === "string" ? calendars[0].id : "";
  const baseline = useMemo(
    () => (event ? formFromRow(event, occurrence) : newEventForm(date, settings.default_color, firstCalendar)),
    [event, occurrence, date, settings.default_color, firstCalendar],
  );
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
  const formRef = useRef<HTMLFormElement>(null);
  const eventId = typeof event?.id === "string" ? event.id : null;
  const copyOf = eventId !== null && occurrence !== undefined ? { series: eventId, date: occurrence } : null;
  // The record being edited: none for a new event or for the copy of an occurrence (both are created on Save).
  const id = copyOf ? null : eventId;
  const eventTz = typeof event?.tzid === "string" ? event.tzid : viewerTz;
  const today = todayIn(eventTz);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const draft = useDraft({
    scope: copyOf ? `event:${copyOf.series}:${copyOf.date}` : id ? `event:${id}` : "event:new",
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
    let calendarId = form.calendar_id;
    if (!calendarId) {
      // No writable calendar yet: the first one is created with the event (the default calendar arrives in HAAL-094).
      calendarId = uuidv7();
      await mutate(user, {
        entity_type: "calendar",
        entity_id: calendarId,
        op: "create",
        data: { name: t("calendar.editor.defaultCalendar"), color: form.color },
      });
      log.info("calendar_created_for_event");
    }
    const title = form.title.trim() || t("calendar.day.noTitle");
    if (copyOf) {
      const newId = uuidv7();
      const values = { title, date: dayLabel(copyOf.date, i18n.language) };
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
          return mutate(user, {
            entity_type: "item",
            entity_id: copyOf.series,
            op: "exclude",
            data: { occurrence_date: copyOf.date, override_event_id: newId },
          });
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
          ]),
      });
      return result.ok;
    }
    if (!event || !id) {
      const newId = uuidv7();
      const result = await runWrite({
        name: "event_create",
        run: () =>
          mutate(user, {
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
          }),
        success: t("calendar.editor.created", { title }),
        undo: () =>
          newStep("event.create", { key: "undo.labels.eventCreated", values: { title } }, { user, id: newId }),
      });
      return result.ok;
    }
    const { data, base, moveTo } = changesOf(event, form);
    let ok = true;
    if (Object.keys(data).length > 0) {
      const version = typeof event.version === "number" ? { base_version: event.version } : {};
      const result = await runWrite({
        name: "event_update",
        run: () => mutate(user, { entity_type: "item", entity_id: id, op: "update", ...version, base, data }),
        success: t("calendar.editor.saved", { title }),
        undo: () =>
          newStep(
            "event.update",
            { key: "undo.labels.eventEdited", values: { title } },
            { user, id, before: base, after: data },
          ),
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

  async function onSubmit(submitted: SubmitEvent<HTMLFormElement>) {
    submitted.preventDefault();
    setTouched(true);
    if (invalid || busy) return;
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
  const series = form.repeat !== "none";
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
          copyOf
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
                hint={series ? t("calendar.editor.repeatHint") : undefined}
              >
                {(aria) => (
                  <Select
                    {...aria}
                    value={form.repeat}
                    onChange={(e) => {
                      const repeat = e.target.value as Repeat;
                      set({ repeat, ...(repeat !== "none" ? { end_date: form.start_date } : {}) });
                    }}
                  >
                    {REPEATS.map((repeat) => (
                      <option key={repeat} value={repeat}>
                        {t(`calendar.editor.repeats.${repeat}`)}
                      </option>
                    ))}
                  </Select>
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
                    {calendars.length === 0 ? <option value="">{t("calendar.editor.newCalendar")}</option> : null}
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

          {copyOf ? (
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
            <Button type="submit" variant="primary" disabled={busy || invalid}>
              {t("calendar.editor.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <UnsavedChangesDialog prompt={guard.prompt} />
    </Dialog>
  );
}
