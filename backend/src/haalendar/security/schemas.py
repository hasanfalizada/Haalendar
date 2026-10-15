"""Base class for every API request/response model.

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-020. Unknown fields are rejected (mass-assignment protection, API Top 10
API3 / ASVS V2 + V4); models are immutable once validated. All endpoint schemas derive from ApiModel.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_max_length=100_000)
