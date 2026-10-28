"""Pull: the changes a user may see since a cursor (ADR-0009, D-56).

+++===+++ 2026-10-21 — Hasan Alizada — HAAL-053.
- One SQL statement reads every syncable table and the current snapshot together, so rows and the list of transactions
  still in progress belong to the same moment. Row-level security of the request decides what is visible.
- A row comes when its number is above the cursor or it was written by a transaction the cursor saw in progress.
- A page holds up to `limit` rows in number order; the next cursor is the last number handed out plus the snapshot's
  in-progress list; the last page jumps to the highest committed number of all tables.
- Share rows of the user as grantee: a revoked one adds a `tombstone` for its container (the device removes the
  container and everything in it); a newly active one brings the container's current content along, whose numbers lie
  below the cursor.
- Internal columns never leave the server (sync bookkeeping, storage keys, legacy ids).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY, TEXT
from sqlalchemy.ext.asyncio import AsyncSession

from haalendar.logging import get_logger
from haalendar.sync.cursor import Cursor, decode, encode

log = get_logger(__name__)

MAX_LIMIT = 1000

# entity type → (table, id column, columns kept off the wire besides sync_seq / sync_xid)
ENTITIES: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "calendar": ("calendar", "id", ()),
    "share": ("share", "id", ()),
    "item": ("item", "id", ("legacy_id",)),
    "attachment": ("attachment", "id", ("storage_key", "thumbnail_key")),
    "settings": ("user_settings", "owner_id", ()),
    # +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. The user's own reminders (owner-only row-level security).
    "reminder": ("reminder", "id", ()),
}


# +++===+++ 2026-10-22 — Hasan Alizada — HAAL-066. An item of kind `event` carries its event fields (times as "HH:MM";
# the derived UTC columns and the copied container stay on the server). Read under the same row-level security.
EVENT_FIELDS_SQL = (
    "coalesce((SELECT (to_jsonb(e) - 'id' - 'container_kind' - 'container_id' - 'start_utc' - 'end_utc') "
    "|| jsonb_build_object('start_time', to_char(e.start_time, 'HH24:MI'), "
    "'end_time', to_char(e.end_time, 'HH24:MI'), "
    # +++===+++ 2026-10-23 — Hasan Alizada — HAAL-067. The excluded dates of a series (active exceptions), ascending.
    "'exceptions', coalesce((SELECT jsonb_agg(to_char(x.occurrence_date, 'YYYY-MM-DD') ORDER BY x.occurrence_date) "
    "FROM recurrence_exception x WHERE x.event_id = e.id AND x.deleted_at IS NULL), '[]'::jsonb)) "
    "FROM event e WHERE e.id = {alias}.id), '{{}}'::jsonb)"
)


def _data_expr(alias: str, hidden: tuple[str, ...], entity: str = "") -> str:
    drops = "".join(f" - '{column}'" for column in ("sync_seq", "sync_xid", *hidden))
    expression = f"to_jsonb({alias}){drops}"
    if entity == "item":
        expression = f"({expression}) || {EVENT_FIELDS_SQL.format(alias=alias)}"
    if entity == "reminder":
        expression = (
            f"({expression}) || jsonb_build_object('all_day_time', to_char({alias}.all_day_time, 'HH24:MI'))"
        )
    return expression


def _changed_rows_sql() -> str:
    parts = []
    for entity, (table, id_column, hidden) in ENTITIES.items():
        parts.append(
            f"(SELECT '{entity}' AS entity, t.{id_column} AS id, t.sync_seq AS seq, {_data_expr('t', hidden, entity)} AS data "  # noqa: S608 — constant identifiers
            f"FROM {table} t WHERE t.sync_seq > :seq OR t.sync_xid = ANY(CAST(:xip AS xid8[])) "
            f"ORDER BY t.sync_seq LIMIT :fetch)"
        )
    return (
        "WITH snap AS (SELECT pg_current_snapshot() AS s), changed AS ("  # noqa: S608 — constant identifiers
        + " UNION ALL ".join(parts)
        + ") SELECT entity, id, seq, data FROM changed "
        "UNION ALL SELECT '__snapshot', NULL, haalendar_sync_high_water(), "
        "to_jsonb(ARRAY(SELECT x::text FROM snap, pg_snapshot_xip(snap.s) AS x)) FROM snap"
    )


CHANGED_ROWS = text(_changed_rows_sql()).bindparams(bindparam("xip", type_=ARRAY(TEXT)))


def _container_content_sql() -> str:
    calendar_table, calendar_id, calendar_hidden = ENTITIES["calendar"]
    item_table, _, item_hidden = ENTITIES["item"]
    attachment_table, _, attachment_hidden = ENTITIES["attachment"]
    return (
        f"SELECT 'calendar' AS entity, t.{calendar_id} AS id, t.sync_seq AS seq, {_data_expr('t', calendar_hidden)} AS data "  # noqa: S608 — constant identifiers
        f"FROM {calendar_table} t WHERE :kind = 'calendar' AND t.id = :container "
        f"UNION ALL SELECT 'item', t.id, t.sync_seq, {_data_expr('t', item_hidden, 'item')} FROM {item_table} t "
        f"WHERE t.container_kind = :kind AND t.container_id = :container "
        f"UNION ALL SELECT 'attachment', t.id, t.sync_seq, {_data_expr('t', attachment_hidden)} FROM {attachment_table} t "
        f"WHERE t.container_kind = :kind AND t.container_id = :container"
    )


CONTAINER_CONTENT = text(_container_content_sql())


async def current_state(db: AsyncSession, entity: str, row_id: uuid.UUID) -> dict[str, Any] | None:
    """The row as a pull would send it (None when unknown or not readable)."""
    table, id_column, hidden = ENTITIES[entity]
    query = text(f"SELECT {_data_expr('t', hidden, entity)} FROM {table} t WHERE t.{id_column} = :id")  # noqa: S608 — constant identifiers
    value = await db.scalar(query, {"id": row_id})
    return dict(value) if value is not None else None


@dataclass(frozen=True)
class Change:
    entity_type: str
    entity_id: uuid.UUID
    op: str
    version: int
    data: dict[str, Any] | None


@dataclass(frozen=True)
class PullResult:
    changes: list[Change]
    cursor: str
    has_more: bool


def _upsert(entity: str, row_id: uuid.UUID, data: dict[str, Any]) -> Change:
    return Change(entity, row_id, "upsert", int(data.get("version", 0)), data)


async def pull(db: AsyncSession, user_id: uuid.UUID, since: str | None, limit: int) -> PullResult:
    start = decode(since)
    limit = max(1, min(limit, MAX_LIMIT))
    rows = (
        await db.execute(
            CHANGED_ROWS,
            # Rows of the listed transactions take places too; one extra row tells whether more follow.
            {"seq": start.seq, "xip": [str(x) for x in start.xip], "fetch": limit + 1 + len(start.xip)},
        )
    ).all()
    snapshot_xip: tuple[int, ...] = ()
    high_water = start.seq
    changed: list[tuple[int, str, uuid.UUID, dict[str, Any]]] = []
    for entity, row_id, seq, data in rows:
        if entity == "__snapshot":
            snapshot_xip = tuple(int(x) for x in data)
            high_water = max(high_water, int(seq or 0))
        else:
            changed.append((int(seq), entity, row_id, data))
    changed.sort(key=lambda row: row[0])

    # Rows of transactions the cursor saw in progress come first in number order like the others; the page is cut by
    # number only among rows above the cursor.
    has_more = sum(1 for seq, *_ in changed if seq > start.seq) > limit
    if has_more:
        cutoff = sorted(seq for seq, *_ in changed if seq > start.seq)[limit - 1]
        changed = [row for row in changed if row[0] <= cutoff]
    # The last page moves the cursor to the highest committed number, also past rows this user cannot read.
    last_seq = max([start.seq, *(seq for seq, *_ in changed)]) if has_more else high_water

    changes: list[Change] = []
    sent = {(entity, row_id) for _seq, entity, row_id, _data in changed}
    for _seq, entity, row_id, data in changed:
        changes.append(_upsert(entity, row_id, data))
        if entity == "share" and str(data.get("grantee_id")) == str(user_id):
            kind, container = str(data["container_kind"]), uuid.UUID(str(data["container_id"]))
            if data.get("revoked_at"):
                changes.append(Change(kind, container, "tombstone", 0, None))
            elif since:
                content = (await db.execute(CONTAINER_CONTENT, {"kind": kind, "container": container})).all()
                for e, i, _s, d in content:
                    if (e, i) not in sent:
                        sent.add((e, i))
                        changes.append(_upsert(e, i, d))

    next_cursor = encode(Cursor(seq=last_seq, xip=snapshot_xip))
    log.info(
        "sync_pull",
        user_id=str(user_id),
        initial=since is None,
        changes=len(changes),
        has_more=has_more,
    )
    return PullResult(changes=changes, cursor=next_cursor, has_more=has_more)
