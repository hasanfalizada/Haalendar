"""Board endpoints outside sync (contract: api/modules/kanban.yaml — board_members).

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-119 (D-97). The members of a board — its owner and everyone with an active
share, with their names and permission — for whoever reads the board (404 otherwise): the people a card can be
assigned to.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter

from haalendar.deps import Auth, DbSession
from haalendar.planning import assignees

router = APIRouter(prefix="/boards", tags=["kanban"])


@router.get("/{id}/members", operation_id="listBoardMembers")
async def list_board_members(id: uuid.UUID, auth: Auth, db: DbSession) -> dict[str, Any]:
    del auth  # the session sets the user for row-level security
    return {"data": await assignees.members(db, id)}
