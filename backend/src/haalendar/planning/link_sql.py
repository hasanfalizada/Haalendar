"""Database side of links between items (FR-INT-01, owner decision D-98).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-120. A link spans two containers (a calendar's event and a board's card,
say), so it has row-level security of its own: read by whoever reads either end's container; written (inserted, soft
deleted, restored) by whoever reads both ends and may write at least one — the author is the inserting user. The
application checks the same (and that both items exist and are readable). Builders used by an applied migration are
frozen.
"""

from __future__ import annotations


def _reads(kind: str, container: str) -> str:
    return (
        f"(haalendar_owns_container({kind}, {container}) "
        f"OR haalendar_share_permission({kind}, {container}) IS NOT NULL)"
    )


def _writes(kind: str, container: str) -> str:
    return (
        f"(haalendar_owns_container({kind}, {container}) "
        f"OR haalendar_share_permission({kind}, {container}) = 'edit')"
    )


def link_policies(table: str = "link") -> list[str]:
    me = "haalendar_current_user_id()"
    reads_from = _reads("container_kind", "container_id")
    reads_to = _reads("to_container_kind", "to_container_id")
    writes_one = (
        f"({_writes('container_kind', 'container_id')} OR {_writes('to_container_kind', 'to_container_id')})"
    )
    return [
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"CREATE POLICY {table}_read ON {table} FOR SELECT USING ({reads_from} OR {reads_to})",
        f"CREATE POLICY {table}_insert ON {table} FOR INSERT "
        f"WITH CHECK ({reads_from} AND {reads_to} AND {writes_one} AND created_by = {me})",
        f"CREATE POLICY {table}_update ON {table} FOR UPDATE USING ({writes_one}) WITH CHECK ({writes_one})",
    ]
