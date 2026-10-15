"""Atom authz.check.v1 — Python implementation (contract: atoms/authz.check.v1/contract.json).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Pure function; must pass atoms/authz.check.v1/vectors.json. Default deny:
only ownership or an active share grants anything, and the actor role is deliberately ignored (admins have no content
access, ADR-0005).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal

Action = Literal["read", "write_items", "manage_container", "share"]
SharePermission = Literal["view", "edit"]
Reason = Literal["owner", "shared_edit", "shared_view", "not_shared", "view_only", "owner_only"]


@dataclass(frozen=True, slots=True)
class Decision:
    allowed: bool
    deny_status: Literal[403, 404] | None
    reason: Reason


def check(
    actor_id: uuid.UUID,
    action: Action,
    owner_id: uuid.UUID,
    share_permission: SharePermission | None,
) -> Decision:
    """Decide `action` on a container owned by `owner_id` for an actor holding `share_permission` (or none)."""
    if actor_id == owner_id:
        return Decision(True, None, "owner")
    if share_permission is None:
        return Decision(False, 404, "not_shared")
    if action in ("manage_container", "share"):
        return Decision(False, 403, "owner_only")
    if action == "read":
        return Decision(True, None, "shared_edit" if share_permission == "edit" else "shared_view")
    if share_permission == "edit":
        return Decision(True, None, "shared_edit")
    return Decision(False, 403, "view_only")
