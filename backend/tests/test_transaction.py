"""One transaction per request (HAAL-160): the response is sent only after the transaction is committed.

+++===+++ 2026-11-07 — Hasan Alizada — HAAL-145 (UAT finding F1). Since FastAPI 0.143 the exit code of a yield
dependency runs after the response is sent unless the dependency has scope="function". The client then got 2xx for a
change that was not stored yet (a sign-in right after "Create account" said "unknown e-mail"; an action right after
re-authentication was refused) or never stored at all when the commit failed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from .account_helpers import invite, login, register

pytestmark = pytest.mark.db


async def _failing_commit(self: AsyncSession) -> None:
    raise RuntimeError("commit failed")


# The contract lists no 500 for any operation: it is the unexpected-error answer of the error handler (HAAL-016).
@pytest.mark.no_contract
def test_a_failed_commit_is_an_error_for_the_client(
    api: TestClient, clean_db: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    token = invite(clean_db, "commit@example.com")
    with monkeypatch.context() as patched:
        patched.setattr(AsyncSession, "commit", _failing_commit)
        status = register(api, "commit@example.com", token)
    assert status == 500
    assert login(api, "commit@example.com")[0] == 401


def test_the_change_is_stored_when_the_response_arrives(api: TestClient, clean_db: str) -> None:
    assert register(api, "fresh@example.com", invite(clean_db, "fresh@example.com")) == 202
    assert login(api, "fresh@example.com")[0] == 200
