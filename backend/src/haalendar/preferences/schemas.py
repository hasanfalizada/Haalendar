"""Request and response models of the settings endpoints (contract: api/modules/accounts.yaml — me_settings).

+++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The patch is a JSON merge patch (RFC 7396): absent fields stay as
they are; inside week_ab only the given keys change.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from haalendar.security.schemas import ApiModel

Color = Literal["red", "orange", "yellow", "green", "blue", "purple", "brown", "black"]
TimeFormat = Literal["24h", "12h"]
Theme = Literal["system", "light", "dark"]
NoteLayout = Literal["grid", "list"]
DayOrder = Literal["time", "color"]


class WeekAbOut(BaseModel):
    enabled: bool
    anchor: date | None
    labels: list[str]


class SettingsOut(BaseModel):
    week_start: int
    time_format: TimeFormat
    theme: Theme
    default_color: Color
    agenda_days: int
    week_ab: WeekAbOut
    hidden_calendars: list[uuid.UUID]
    # +++===+++ 2026-11-18 14:33 +04 — Hasan Alizada — HAAL-103. Grid or list on the To-Do page (D-110).
    note_layout: NoteLayout
    # +++===+++ 2026-11-18 16:37 +04 — Hasan Alizada — HAAL-185. The order of a day's events (D-111).
    day_order: DayOrder
    version: int


class WeekAbPatchIn(ApiModel):
    enabled: bool | None = None
    anchor: date | None = None
    labels: list[str] | None = Field(default=None, min_length=2, max_length=2)


class SettingsPatchIn(ApiModel):
    week_start: int | None = Field(default=None, ge=0, le=6)
    time_format: TimeFormat | None = None
    theme: Theme | None = None
    default_color: Color | None = None
    agenda_days: int | None = Field(default=None, ge=1, le=365)
    week_ab: WeekAbPatchIn | None = None
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. The whole list (D-82): calendars hidden in the views.
    hidden_calendars: list[uuid.UUID] | None = Field(default=None, max_length=500)
    note_layout: NoteLayout | None = None
    day_order: DayOrder | None = None
