"""User settings: read with defaults, merge-patch update with If-Match (FR-ACC-09, FR-CAL-23/27, D-50).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. A user's row is created on first use (row-level security lets only
the user create it; rows of users that existed before migration 0012 were created there). Week A/B: labels are
trimmed, 1 to 10 characters and must differ (atom calendar.week_ab_label.v1, error LABELS_NOT_DISTINCT); switching it on
needs an anchor (any date of the week that is the first label). Changes are logged without their values.
+++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. `hidden_calendars` (D-82): the calendars hidden in the views, stored
as a sorted list without repeats.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.errors import ProblemCode, ProblemError
from haalendar.logging import get_logger
from haalendar.preferences.models import UserSettings
from haalendar.preferences.schemas import SettingsOut, SettingsPatchIn, WeekAbOut

log = get_logger(__name__)

LABEL_MAX = 10


def to_out(row: UserSettings) -> SettingsOut:
    return SettingsOut(
        week_start=row.week_start,
        time_format=row.time_format,
        theme=row.theme,
        default_color=row.default_color,
        agenda_days=row.agenda_days,
        week_ab=WeekAbOut(
            enabled=row.week_ab_enabled, anchor=row.week_ab_anchor, labels=list(row.week_ab_labels)
        ),
        hidden_calendars=list(row.hidden_calendars),
        version=row.version,
    )


async def get_settings(db: AsyncSession, owner_id: uuid.UUID, *, for_update: bool = False) -> UserSettings:
    """The user's settings row; created with the defaults when the user has none yet."""
    query = select(UserSettings).where(UserSettings.owner_id == owner_id)
    if for_update:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if row is None:
        await db.execute(insert(UserSettings).values(owner_id=owner_id).on_conflict_do_nothing())
        row = (await db.execute(query)).scalar_one()
        log.info("settings_created", user_id=str(owner_id))
    return row


def _invalid(pointer: str, detail: str) -> ProblemError:
    return ProblemError(
        422,
        ProblemCode.VALIDATION_FAILED,
        "Invalid settings",
        errors=[{"pointer": pointer, "detail": detail}],
    )


def _labels(raw: list[str]) -> list[str]:
    labels = [label.strip() for label in raw]
    for i, label in enumerate(labels):
        if not 1 <= len(label) <= LABEL_MAX:
            raise _invalid(f"/week_ab/labels/{i}", f"Use 1 to {LABEL_MAX} characters")
    return labels


async def update_settings(
    db: AsyncSession, owner_id: uuid.UUID, patch: SettingsPatchIn, *, expected_version: int
) -> UserSettings:
    row = await get_settings(db, owner_id, for_update=True)
    if row.version != expected_version:
        raise ProblemError(
            412,
            ProblemCode.VERSION_CONFLICT,
            "The settings were changed meanwhile",
            current=to_out(row).model_dump(mode="json"),
        )
    changes: dict[str, Any] = {
        field: value
        for field in ("week_start", "time_format", "theme", "default_color", "agenda_days")
        if (value := getattr(patch, field)) is not None
    }
    if patch.hidden_calendars is not None:
        # Unknown or foreign ids are kept as given: hiding only filters what the user sees (D-82).
        changes["hidden_calendars"] = sorted(set(patch.hidden_calendars))
    if patch.week_ab is not None:
        if patch.week_ab.enabled is not None:
            changes["week_ab_enabled"] = patch.week_ab.enabled
        if patch.week_ab.anchor is not None:
            changes["week_ab_anchor"] = patch.week_ab.anchor
        if patch.week_ab.labels is not None:
            changes["week_ab_labels"] = _labels(patch.week_ab.labels)

    enabled = changes.get("week_ab_enabled", row.week_ab_enabled)
    anchor = changes.get("week_ab_anchor", row.week_ab_anchor)
    labels = changes.get("week_ab_labels", row.week_ab_labels)
    if enabled and anchor is None:
        raise _invalid("/week_ab/anchor", "Choose a date in a week that should be labelled first")
    if labels[0].casefold() == labels[1].casefold():  # the atom's LABELS_NOT_DISTINCT rule
        raise _invalid("/week_ab/labels", "Use two different labels")

    changed = sorted(field for field, value in changes.items() if getattr(row, field) != value)
    for field in changed:
        setattr(row, field, changes[field])
    if changed:
        row.version += 1
        log.info("settings_updated", user_id=str(owner_id), fields=changed)
    return row
