"""Admin panel: user list, invitations, role changes, soft deactivation, reactivation, self-protection, re-auth and
the last-admin guard under concurrency (marker `db`).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-164.
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from haalendar.accounts import service
from haalendar.accounts.mailer import FileMailer
from haalendar.accounts.models import UserAccount
from haalendar.errors import ProblemError
from haalendar.main import create_app

from .account_helpers import PASSWORD, create_user, link_token, login, mails, register, sql
from .conftest import make_settings

pytestmark = pytest.mark.db


def _csrf(body: dict[str, object]) -> dict[str, str]:
    token = body["csrf_token"]
    assert isinstance(token, str)
    return {"X-CSRF-Token": token}


def _id(db_url: str, address: str) -> str:
    return str(sql(db_url, "SELECT id FROM user_account WHERE email = %s", address)[0][0])


def _admin(api: TestClient, db_url: str, address: str = "root@example.org") -> dict[str, str]:
    create_user(api, db_url, address, role="admin")
    status, body = login(api, address)
    assert status == 200
    return _csrf(body)


# ---------- list ----------


def test_list_filters_and_paginates_without_content(api: TestClient, clean_db: str) -> None:
    headers = _admin(api, clean_db)
    for name in ("ann", "bob", "cid", "dee"):
        create_user(api, clean_db, f"{name}@example.org")
    sql(clean_db, "UPDATE user_account SET deactivated_at = now() WHERE email = 'bob@example.org'")
    sql(
        clean_db,
        "UPDATE user_account SET locked_until = now() + interval '1 hour' WHERE email = 'cid@example.org'",
    )
    sql(clean_db, "UPDATE user_account SET email_verified_at = NULL WHERE email = 'dee@example.org'")

    every = api.get("/api/v1/admin/users", headers=headers).json()
    assert every["data"][0]["email"] == "root@example.org" and every["next_cursor"] is None
    statuses = {u["email"]: u["status"] for u in every["data"]}
    assert statuses == {
        "root@example.org": "active",
        "ann@example.org": "active",
        "bob@example.org": "deactivated",
        "cid@example.org": "locked",
        "dee@example.org": "unverified",
    }
    assert set(every["data"][0]) == {
        "id", "email", "display_name", "role", "status", "totp_enabled", "last_login_at", "created_at", "version"
    }  # fmt: skip

    for wanted in ("active", "deactivated", "locked", "unverified"):
        page = api.get("/api/v1/admin/users", params={"status": wanted}, headers=headers).json()
        assert {u["status"] for u in page["data"]} == {wanted}
    found = api.get("/api/v1/admin/users", params={"q": "CI"}, headers=headers).json()["data"]
    assert [u["email"] for u in found] == ["cid@example.org"]
    assert api.get("/api/v1/admin/users", params={"q": "%"}, headers=headers).json()["data"] == []

    first = api.get("/api/v1/admin/users", params={"limit": 2}, headers=headers).json()
    second = api.get(
        "/api/v1/admin/users", params={"limit": 2, "cursor": first["next_cursor"]}, headers=headers
    ).json()
    third = api.get(
        "/api/v1/admin/users", params={"limit": 2, "cursor": second["next_cursor"]}, headers=headers
    ).json()
    emails = [u["email"] for page in (first, second, third) for u in page["data"]]
    assert emails == [u["email"] for u in every["data"]] and third["next_cursor"] is None
    bad = api.get("/api/v1/admin/users", params={"cursor": "%%%"}, headers=headers)
    assert bad.status_code == 400


def test_non_admin_is_refused(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "plain@example.org")
    _, body = login(api, "plain@example.org")
    assert api.get("/api/v1/admin/users").json()["code"] == "forbidden"
    assert (
        api.post("/api/v1/admin/invites", json={"email": "x@example.org"}, headers=_csrf(body)).status_code
        == 403
    )


# ---------- invitations ----------


def test_invite_without_smtp_creates_account_with_one_time_password(api: TestClient, clean_db: str) -> None:
    headers = _admin(api, clean_db)
    created = api.post(
        "/api/v1/admin/invites", json={"email": "Nia@Example.org", "role": "admin"}, headers=headers
    )
    assert created.status_code == 201
    body = created.json()
    assert body["delivery"] == "one_time_password" and "invite" not in body
    assert body["user"]["role"] == "admin" and body["user"]["display_name"] == "Nia"
    assert body["user"]["status"] == "active"
    one_time = body["one_time_password"]

    duplicate = api.post("/api/v1/admin/invites", json={"email": "nia@example.org"}, headers=headers)
    assert duplicate.status_code == 409 and duplicate.json()["code"] == "duplicate"

    status, user = login(api, "nia@example.org", one_time)
    assert status == 200
    me = user["me"]
    assert isinstance(me, dict) and me["must_change_password"] is True and me["time_zone"] == "Europe/Berlin"


def _smtp_client(db_url: str, mail_dir: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """SMTP configured; messages are written by the file mailer so the links can be read back."""
    file_mailer = FileMailer(make_settings(mail_dir=str(mail_dir)))

    async def to_file(self: object, to: str, subject: str, body: str) -> bool:
        return await file_mailer.send(to, subject, body)

    monkeypatch.setattr("haalendar.accounts.mailer.SmtpMailer.send", to_file)
    app = create_app(make_settings(database_url=db_url, smtp_host="smtp.example.org", mail_dir=str(mail_dir)))
    return TestClient(app, base_url="https://testserver", raise_server_exceptions=False)


def test_invite_by_email_reinvite_revoke_and_accept(
    clean_db: str, mail_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    with _smtp_client(clean_db, mail_dir, monkeypatch) as api:
        headers = _admin(api, clean_db)
        first = api.post("/api/v1/admin/invites", json={"email": "ola@example.org"}, headers=headers)
        assert first.status_code == 201 and first.json()["delivery"] == "email"
        assert "one_time_password" not in first.json() and first.json()["invite"]["role"] == "user"
        old_token = link_token(mails(mail_dir)[-1])
        assert "/invite?token=" in str(mails(mail_dir)[-1].get_payload(decode=True))

        info = api.post("/api/v1/auth/invite-info", json={"token": old_token})
        assert info.status_code == 200 and info.json()["email"] == "ola@example.org"

        again = api.post("/api/v1/admin/invites", json={"email": "OLA@example.org"}, headers=headers)
        new_token = link_token(mails(mail_dir)[-1])
        assert api.post("/api/v1/auth/invite-info", json={"token": old_token}).status_code == 400
        pending = api.get("/api/v1/admin/invites", headers=headers).json()["data"]
        assert [i["id"] for i in pending] == [again.json()["invite"]["id"]]
        assert sql(clean_db, "SELECT count(*) FROM auth_token WHERE email ILIKE 'ola@example.org'") == [
            (2,)
        ]  # kept

        assert register(api, "ola@example.org", new_token) == 202
        assert api.get("/api/v1/admin/invites", headers=headers).json()["data"] == []
        assert login(api, "ola@example.org")[0] == 200

        _, root = login(api, "root@example.org")
        headers = _csrf(root)
        third = api.post("/api/v1/admin/invites", json={"email": "pat@example.org"}, headers=headers).json()
        token = link_token(mails(mail_dir)[-1])
        assert (
            api.delete(f"/api/v1/admin/invites/{third['invite']['id']}", headers=headers).status_code == 204
        )
        assert (
            api.delete(f"/api/v1/admin/invites/{third['invite']['id']}", headers=headers).status_code == 404
        )
        assert register(api, "pat@example.org", token) == 400
        assert sql(
            clean_db, "SELECT revoked_at IS NOT NULL FROM auth_token WHERE email = 'pat@example.org'"
        ) == [(True,)]


def test_invite_info_rejects_unknown_token(api: TestClient) -> None:
    response = api.post("/api/v1/auth/invite-info", json={"token": "nope"})
    assert response.status_code == 400 and response.json()["code"] == "bad_request"


# ---------- deactivate / reactivate / reset ----------


def test_deactivate_is_soft_signs_out_and_reactivate_restores(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "una@example.org")
    una_id = _id(clean_db, "una@example.org")
    assert login(api, "una@example.org")[0] == 200
    una_cookie = api.cookies.get("__Host-haalendar_session")
    headers = _admin(api, clean_db)

    done = api.post(f"/api/v1/admin/users/{una_id}/deactivate", headers=headers)
    assert done.status_code == 200 and done.json()["user"]["status"] == "deactivated"
    again = api.post(f"/api/v1/admin/users/{una_id}/deactivate", headers=headers)
    assert again.status_code == 200 and again.json()["user"]["version"] == done.json()["user"]["version"]
    assert sql(clean_db, "SELECT count(*) FROM user_account WHERE email = 'una@example.org'") == [(1,)]
    assert sql(
        clean_db, "SELECT count(*) FROM session WHERE user_id = %s AND revoked_at IS NULL", una_id
    ) == [(0,)]
    other = TestClient(
        api.app, base_url="https://testserver", cookies={"__Host-haalendar_session": una_cookie or ""}
    )
    assert other.get("/api/v1/me").status_code == 401

    reset = api.post(f"/api/v1/admin/users/{una_id}/reset-password", headers=headers)
    assert reset.status_code == 409 and reset.json()["code"] == "invalid_state"

    back = api.post(f"/api/v1/admin/users/{una_id}/reactivate", headers=headers)
    assert back.status_code == 200 and back.json()["user"]["status"] == "active"
    assert login(api, "una@example.org", PASSWORD)[0] == 200


def test_actions_on_unknown_user_and_unknown_action(api: TestClient, clean_db: str) -> None:
    headers = _admin(api, clean_db)
    missing = uuid.uuid4()
    assert api.post(f"/api/v1/admin/users/{missing}/deactivate", headers=headers).status_code == 404
    root_id = _id(clean_db, "root@example.org")
    assert api.post(f"/api/v1/admin/users/{root_id}/explode", headers=headers).status_code == 422


def test_admin_cannot_act_on_own_account(api: TestClient, clean_db: str) -> None:
    headers = _admin(api, clean_db)
    root_id = _id(clean_db, "root@example.org")
    for action in ("deactivate", "reactivate", "unlock", "reset-password"):
        response = api.post(f"/api/v1/admin/users/{root_id}/{action}", headers=headers)
        assert response.status_code == 409 and response.json()["code"] == "invalid_state", action
    demote = api.patch(
        f"/api/v1/admin/users/{root_id}",
        json={"role": "user"},
        headers={**headers, "If-Match": '"1"', "Content-Type": "application/merge-patch+json"},
    )
    assert demote.status_code == 409


# ---------- role ----------


def test_role_change_uses_if_match(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "vic@example.org")
    vic_id = _id(clean_db, "vic@example.org")
    headers = {**_admin(api, clean_db), "Content-Type": "application/merge-patch+json"}
    url = f"/api/v1/admin/users/{vic_id}"

    missing = api.patch(url, json={"role": "admin"}, headers=headers)
    assert missing.status_code == 428 and missing.json()["code"] == "precondition_required"
    malformed = api.patch(url, json={"role": "admin"}, headers={**headers, "If-Match": "W/1"})
    assert malformed.status_code == 400
    stale = api.patch(url, json={"role": "admin"}, headers={**headers, "If-Match": '"9"'})
    assert stale.status_code == 412 and stale.json()["code"] == "version_conflict"
    assert stale.json()["current"]["version"] == 1 and stale.json()["current"]["role"] == "user"

    promoted = api.patch(url, json={"role": "admin"}, headers={**headers, "If-Match": '"1"'})
    assert promoted.status_code == 200 and promoted.json()["role"] == "admin"
    assert promoted.headers["ETag"] == '"2"' and promoted.json()["version"] == 2
    same = api.patch(url, json={"role": "admin"}, headers={**headers, "If-Match": '"2"'})
    assert same.status_code == 200 and same.json()["version"] == 2
    unknown_field = api.patch(url, json={"email": "x@example.org"}, headers={**headers, "If-Match": '"2"'})
    assert unknown_field.status_code == 422
    demoted = api.patch(url, json={"role": "user"}, headers={**headers, "If-Match": '"2"'})
    assert demoted.status_code == 200 and demoted.json()["role"] == "user"


def test_mutations_require_recent_reauth(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "wes@example.org")
    wes_id = _id(clean_db, "wes@example.org")
    headers = _admin(api, clean_db)
    sql(clean_db, "UPDATE session SET reauth_at = now() - interval '1 hour'")
    responses = [
        api.post("/api/v1/admin/invites", json={"email": "new@example.org"}, headers=headers),
        api.post(f"/api/v1/admin/users/{wes_id}/deactivate", headers=headers),
        api.patch(
            f"/api/v1/admin/users/{wes_id}",
            json={"role": "admin"},
            headers={**headers, "If-Match": '"1"', "Content-Type": "application/merge-patch+json"},
        ),
        api.delete(f"/api/v1/admin/invites/{uuid.uuid4()}", headers=headers),
    ]
    assert [r.json()["code"] for r in responses] == ["reauth_required"] * 4
    assert api.get("/api/v1/admin/users", headers=headers).status_code == 200  # reading needs no re-auth


# ---------- last admin under concurrency ----------


def test_two_admins_demoting_each_other_keep_one_admin(api: TestClient, clean_db: str) -> None:
    create_user(api, clean_db, "ada@example.org", role="admin")
    create_user(api, clean_db, "bea@example.org", role="admin")
    ada_id = uuid.UUID(_id(clean_db, "ada@example.org"))
    bea_id = uuid.UUID(_id(clean_db, "bea@example.org"))

    async def run() -> ProblemError | None:
        engine = create_async_engine(clean_db)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as first, factory() as second:
                ada = await first.get(UserAccount, ada_id)
                bea_as_caller = await second.get(UserAccount, bea_id)
                assert ada is not None and bea_as_caller is not None
                await service.admin_set_role(first, ada, bea_id, "user", 1)  # holds the lock, not committed

                async def bea_demotes_ada() -> None:
                    await service.admin_set_role(second, bea_as_caller, ada_id, "user", 1)
                    await second.commit()

                task = asyncio.create_task(bea_demotes_ada())
                await asyncio.sleep(0.5)
                assert not task.done()  # waits for the advisory lock
                await first.commit()
                try:
                    await task
                except ProblemError as error:
                    await second.rollback()
                    return error
                return None
        finally:
            await engine.dispose()

    error = asyncio.run(run())
    assert error is not None and error.status == 403  # bea lost the admin role while waiting
    assert sql(clean_db, "SELECT email FROM user_account WHERE role = 'admin' ORDER BY email") == [
        ("ada@example.org",)
    ]
