"""SQLAlchemy declarative base shared by all persistence models.

+++===+++ 2026-10-14 — Hasan Alizada — HAAL-016. Deterministic constraint names so Alembic migrations are stable
across environments. Tables are added by later tasks following docs: domain model v1.0 (soft delete only).
"""

from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
