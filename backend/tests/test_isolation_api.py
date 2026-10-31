"""Isolation through the API, operation by operation (FR-ACC-07, ADR-0005; marker `db`).

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. Ada owns one of everything (calendar, timed event with a reminder,
note with a checklist item, board with a column, a card, a label on it and an assignee, a link, attachments, a share
with Bob, a deleted note in the trash, an export, a session, a push subscription); Cid, a user without any share, then
calls every operation of the contract with Ada's ids. Afterwards nothing of Ada's has appeared in any of Cid's answers
(ids, titles, names) and nothing of Ada's or Bob's has changed. The rules are keyed by the contract's operations: a new
operation without a rule here fails `test_every_operation_has_an_isolation_rule`.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from . import contract
from .account_helpers import create_user, sql
from .test_attachments import png
from .test_push import Browser, FakePushService, push_service  # noqa: F401 (fixture)
from .test_sharing import People
from .test_sync import _m, _pull, _push

pytestmark = pytest.mark.db

# Why an operation is not probed with Ada's ids (everything else is, in test_a_stranger_reaches_nothing_of_another_user).
PUBLIC = "public: answers without a signed-in user and returns no user content"
OWN = "acts only on the signed-in user's own account (no id of another user in the request)"
ADMIN = "administrators only: probed as a plain user, who is refused"
AVATAR = "every signed-in user may see every avatar (D-29)"
STREAM = (
    "the live stream tells only the users concerned: test_live.py "
    "(test_delivery_reaches_only_connected_users_concerned, test_audience_is_owner_and_current_grantees)"
)
EXEMPT: dict[tuple[str, str], str] = {
    ("get", "/setup/status"): PUBLIC,
    ("post", "/setup/admin"): PUBLIC,
    ("post", "/auth/login"): PUBLIC,
    ("post", "/auth/logout"): OWN,
    ("post", "/auth/register"): PUBLIC,
    ("post", "/auth/invite-info"): PUBLIC,
    ("post", "/auth/verify-email"): PUBLIC,
    ("post", "/auth/verify-email/resend"): PUBLIC,
    ("post", "/auth/password-reset/request"): PUBLIC,
    ("post", "/auth/password-reset/confirm"): PUBLIC,
    ("post", "/auth/reauth"): OWN,
    ("get", "/health/live"): PUBLIC,
    ("get", "/health/ready"): PUBLIC,
    ("get", "/push/vapid-public-key"): PUBLIC,
    ("get", "/me"): OWN,
    ("patch", "/me"): OWN,
    ("put", "/me/avatar"): OWN,
    ("delete", "/me/avatar"): OWN,
    ("post", "/me/password"): OWN,
    ("get", "/me/settings"): OWN,
    ("patch", "/me/settings"): OWN,
    ("post", "/me/sessions/revoke-others"): OWN,
    ("post", "/me/totp/setup"): OWN,
    ("post", "/me/totp/enable"): OWN,
    ("post", "/me/totp/disable"): OWN,
    ("post", "/me/totp/recovery-codes"): OWN,
    ("post", "/me/push-subscriptions"): OWN,
    ("get", "/users/{id}/avatar"): AVATAR,
    ("get", "/stream"): STREAM,
    ("post", "/exports"): OWN + "; the archive holds only what the user owns: test_exports.py "
    "(test_archive_holds_what_the_user_owns_valid_against_the_schema)",
}
ADMIN_OPERATIONS = {
    ("get", "/admin/users"),
    ("patch", "/admin/users/{id}"),
    ("post", "/admin/users/{id}/{action}"),
    ("get", "/admin/invites"),
    ("post", "/admin/invites"),
    ("delete", "/admin/invites/{id}"),
    ("get", "/admin/settings"),
    ("patch", "/admin/settings"),
}
REFUSED = {403, 404}


class Ada:
    """Everything Ada owns, made through the API as the web app makes it."""

    IDS = (
        "calendar",
        "event",
        "note",
        "gone_note",
        "card",
        "board",
        "column",
        "label",
        "item_label",
        "reminder",
        "checklist_item",
        "link",
        "assignee",
        "attachment",
        "share",
        "export",
        "subscription",
    )

    def __init__(self, people: People, push: FakePushService) -> None:
        self.people = people
        api = people.api
        h = people.as_("ada")
        self.calendar = people.calendar
        self.event, self.note, self.gone_note, self.card = (str(uuid.uuid7()) for _ in range(4))
        self.board, self.column, self.label, self.item_label = (str(uuid.uuid7()) for _ in range(4))
        self.reminder, self.checklist_item, self.link, self.assignee = (str(uuid.uuid7()) for _ in range(4))
        made = _push(
            api,
            h,
            _m(
                "item",
                self.event,
                "create",
                data={
                    "kind": "event",
                    "container_kind": "calendar",
                    "container_id": self.calendar,
                    "title": "Ada secret dentist",
                    "all_day": False,
                    "start_date": "2026-11-10",
                    "start_time": "11:00",
                    "end_date": "2026-11-10",
                    "end_time": "12:00",
                    "tzid": "Europe/Berlin",
                },
            ),
            _m("reminder", self.reminder, "create", data={"item_id": self.event, "offset_minutes": 15}),
            _m(
                "item",
                self.note,
                "create",
                data={"kind": "note", "title": "Ada secret note", "position": "U"},
            ),
            _m(
                "item",
                self.gone_note,
                "create",
                data={"kind": "note", "title": "Ada secret bin", "position": "V"},
            ),
            _m("item", self.gone_note, "delete"),
            _m(
                "checklist_item",
                self.checklist_item,
                "create",
                data={"item_id": self.note, "text": "Ada secret task", "position": "U"},
            ),
            _m("board", self.board, "create", data={"name": "Ada secret board", "position": "U"}),
            _m(
                "board_column",
                self.column,
                "create",
                data={"board_id": self.board, "name": "Doing", "position": "U"},
            ),
            _m(
                "item",
                self.card,
                "create",
                data={
                    "kind": "card",
                    "container_kind": "board",
                    "container_id": self.board,
                    "column_id": self.column,
                    "title": "Ada secret card",
                    "position": "U",
                },
            ),
            _m("label", self.label, "create", data={"board_id": self.board, "name": "Ada secret label"}),
            _m("item_label", self.item_label, "create", data={"item_id": self.card, "label_id": self.label}),
            _m(
                "card_assignee",
                self.assignee,
                "create",
                data={"item_id": self.card, "user_id": people.ids["ada"]},
            ),
            _m("link", self.link, "create", data={"from_item_id": self.event, "to_item_id": self.note}),
        )
        assert all(r["status"] == "applied" for r in made), made
        self.attachment = self._upload(h, self.note)
        shared = people.share(h, "bob@example.org", "edit")
        assert shared.status_code == 201, shared.text
        self.share = shared.json()["id"]
        export = api.post("/api/v1/exports", json={"modules": ["calendar", "todo", "kanban"]}, headers=h)
        assert export.status_code in (201, 202), export.text
        self.export = export.json()["id"]
        subscribed = api.post(
            "/api/v1/me/push-subscriptions", json=Browser().subscription(push.endpoint("ada")), headers=h
        )
        assert subscribed.status_code == 201, subscribed.text
        self.subscription = subscribed.json()["id"]
        self.sessions = [s["id"] for s in api.get("/api/v1/me/sessions").json()["data"]]
        # Bob is told about the share: a notification that is not Cid's either.
        people.as_("bob")
        self.bob_notifications = [n["id"] for n in api.get("/api/v1/notifications").json()["data"]]
        assert self.bob_notifications

    def _upload(self, h: dict[str, str], item: str) -> str:
        response = self.people.api.post(
            f"/api/v1/items/{item}/attachments",
            content=png(),
            headers={**h, "Content-Type": "image/png", "X-File-Name": quote("ada-secret.png")},
        )
        assert response.status_code == 201, response.text
        return str(response.json()["id"])

    def secrets(self) -> list[str]:
        """What must never show up in another user's answers."""
        ids = [*(getattr(self, name) for name in self.IDS), *self.sessions, *self.bob_notifications]
        return [*ids, "Ada secret", "ada-secret.png", "Family"]

    def state(self) -> dict[str, Any]:
        """Ada's and Bob's data as they see it (compared before and after the stranger's attempts)."""
        api = self.people.api
        self.people.as_("ada")
        pulled = sorted(json.dumps(c, sort_keys=True) for c in _pull(api)["changes"])
        state = {
            "pull": pulled,
            "attachments": api.get(f"/api/v1/items/{self.note}/attachments").json(),
            "shares": api.get("/api/v1/shares").json(),
            "trash": api.get("/api/v1/trash").json(),
            "exports": [e["id"] for e in api.get("/api/v1/exports").json()["data"]],
            "sessions": [s["id"] for s in api.get("/api/v1/me/sessions").json()["data"]],
        }
        self.people.as_("bob")
        state["bob_notifications"] = api.get("/api/v1/notifications").json()
        return state


@pytest.fixture
def ada(api: TestClient, clean_db: str, push_service: FakePushService) -> Ada:  # noqa: F811
    return Ada(People(api, clean_db), push_service)


def _implemented() -> set[tuple[str, str]]:
    return {(op.method, op.path) for op in contract.operations() if not op.not_implemented}


def _probes(ada: Ada, h: dict[str, str]) -> dict[tuple[str, str], Callable[[TestClient], Any]]:
    """One call per operation, as Cid, aimed at Ada's things."""
    ics = b"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nBEGIN:VEVENT\r\nUID:planted\r\nSUMMARY:Planted\r\n"
    ics += b"DTSTART;VALUE=DATE:20261224\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    upload = {**h, "Content-Type": "image/png", "X-File-Name": "planted.png"}
    a = "/api/v1"
    return {
        ("get", "/calendars/{id}/export.ics"): lambda c: c.get(f"{a}/calendars/{ada.calendar}/export.ics"),
        ("post", "/calendars/{id}/import-ics"): lambda c: c.post(
            f"{a}/calendars/{ada.calendar}/import-ics",
            content=ics,
            headers={**h, "Content-Type": "text/calendar"},
        ),
        ("get", "/boards/{id}/members"): lambda c: c.get(f"{a}/boards/{ada.board}/members"),
        ("get", "/items/{id}/attachments"): lambda c: c.get(f"{a}/items/{ada.note}/attachments"),
        ("post", "/items/{id}/attachments"): lambda c: c.post(
            f"{a}/items/{ada.note}/attachments", content=png(), headers=upload
        ),
        ("get", "/attachments/{id}"): lambda c: c.get(f"{a}/attachments/{ada.attachment}"),
        ("get", "/attachments/{id}/thumbnail"): lambda c: c.get(
            f"{a}/attachments/{ada.attachment}/thumbnail"
        ),
        ("delete", "/attachments/{id}"): lambda c: c.delete(f"{a}/attachments/{ada.attachment}", headers=h),
        ("post", "/shares"): lambda c: c.post(
            f"{a}/shares",
            json={
                "container_kind": "calendar",
                "container_id": ada.calendar,
                "grantee_email": "cid@example.org",
                "permission": "edit",
            },
            headers=h,
        ),
        ("patch", "/shares/{id}"): lambda c: c.patch(
            f"{a}/shares/{ada.share}", json={"permission": "view"}, headers={**h, "If-Match": '"1"'}
        ),
        ("delete", "/shares/{id}"): lambda c: c.delete(f"{a}/shares/{ada.share}", headers=h),
        ("post", "/trash/restore"): lambda c: c.post(
            f"{a}/trash/restore", json={"entries": [{"type": "note", "id": ada.gone_note}]}, headers=h
        ),
        ("get", "/exports/{id}/download"): lambda c: c.get(f"{a}/exports/{ada.export}/download"),
        ("post", "/notifications/read"): lambda c: c.post(
            f"{a}/notifications/read", json={"ids": ada.bob_notifications}, headers=h
        ),
        ("post", "/bulk"): lambda c: c.post(
            f"{a}/bulk",
            json={
                "action": "set_color",
                "color": "red",
                "targets": [
                    {"type": "calendar", "id": ada.calendar, "version": 1},
                    {"type": "event", "id": ada.event, "version": 1},
                    {"type": "note", "id": ada.note, "version": 1},
                    {"type": "card", "id": ada.card, "version": 1},
                ],
            },
            headers=h,
        ),
        ("delete", "/me/sessions/{id}"): lambda c: c.delete(f"{a}/me/sessions/{ada.sessions[0]}", headers=h),
        ("delete", "/me/push-subscriptions/{id}"): lambda c: c.delete(
            f"{a}/me/push-subscriptions/{ada.subscription}", headers=h
        ),
    }


def _lists(ada: Ada) -> dict[tuple[str, str], list[str]]:
    """Operations that answer with the caller's own things: Cid's answers must not name Ada's."""
    return {
        ("get", "/shares"): ["/api/v1/shares", "/api/v1/shares?direction=received"],
        ("get", "/trash"): ["/api/v1/trash"],
        ("get", "/exports"): ["/api/v1/exports"],
        ("get", "/notifications"): ["/api/v1/notifications"],
        ("get", "/sync/pull"): ["/api/v1/sync/pull?limit=500"],
        ("get", "/me/sessions"): ["/api/v1/me/sessions"],
    }


def _pushes(ada: Ada, cid: str) -> list[dict[str, Any]]:
    """Changes of Ada's records and new records inside Ada's containers, sent as Cid."""
    other = str(uuid.uuid7())
    return [
        _m("calendar", ada.calendar, "update", base={"name": "Family"}, data={"name": "Taken"}),
        _m("calendar", ada.calendar, "delete"),
        _m("item", ada.event, "update", base={"title": "Ada secret dentist"}, data={"title": "Taken"}),
        _m("item", ada.event, "delete"),
        _m("item", ada.gone_note, "restore"),
        _m(
            "item",
            ada.note,
            "move",
            base={"container_kind": None, "container_id": None},
            data={"container_kind": "calendar", "container_id": ada.calendar},
        ),
        _m("item", ada.card, "update", base={"title": "Ada secret card"}, data={"title": "Taken"}),
        _m("reminder", ada.reminder, "update", base={"offset_minutes": 15}, data={"offset_minutes": 5}),
        _m("reminder", ada.reminder, "delete"),
        _m("checklist_item", ada.checklist_item, "update", base={"checked": False}, data={"checked": True}),
        _m("checklist_item", ada.checklist_item, "delete"),
        _m("board", ada.board, "update", base={"name": "Ada secret board"}, data={"name": "Taken"}),
        _m("board", ada.board, "delete"),
        _m("board_column", ada.column, "update", base={"name": "Doing"}, data={"name": "Taken"}),
        _m("board_column", ada.column, "delete"),
        _m("label", ada.label, "update", base={"name": "Ada secret label"}, data={"name": "Taken"}),
        _m("label", ada.label, "delete"),
        _m("item_label", ada.item_label, "delete"),
        _m("card_assignee", ada.assignee, "delete"),
        _m("link", ada.link, "delete"),
        _m(
            "item",
            str(uuid.uuid7()),
            "create",
            data={
                "kind": "event",
                "container_kind": "calendar",
                "container_id": ada.calendar,
                "title": "Planted",
                "start_date": "2026-11-12",
            },
        ),
        _m(
            "item",
            str(uuid.uuid7()),
            "create",
            data={
                "kind": "card",
                "container_kind": "board",
                "container_id": ada.board,
                "column_id": ada.column,
                "title": "Planted",
                "position": "W",
            },
        ),
        _m("reminder", str(uuid.uuid7()), "create", data={"item_id": ada.event, "offset_minutes": 5}),
        _m(
            "checklist_item",
            str(uuid.uuid7()),
            "create",
            data={"item_id": ada.note, "text": "x", "position": "V"},
        ),
        _m(
            "board_column",
            str(uuid.uuid7()),
            "create",
            data={"board_id": ada.board, "name": "x", "position": "V"},
        ),
        _m("label", str(uuid.uuid7()), "create", data={"board_id": ada.board, "name": "Planted"}),
        _m("item_label", str(uuid.uuid7()), "create", data={"item_id": ada.card, "label_id": ada.label}),
        _m("card_assignee", str(uuid.uuid7()), "create", data={"item_id": ada.card, "user_id": cid}),
        _m("item", other, "create", data={"kind": "note", "title": "Cid's own", "position": "U"}),
        _m("link", str(uuid.uuid7()), "create", data={"from_item_id": other, "to_item_id": ada.note}),
    ]


def test_every_operation_has_an_isolation_rule() -> None:
    sample = Ada.__new__(Ada)  # the rules need ids, not records
    sample.__dict__.update(dict.fromkeys(Ada.IDS, "x"), sessions=["x"], bob_notifications=["x"])
    covered = (
        set(_probes(sample, {}))
        | set(_lists(sample))
        | set(EXEMPT)
        | ADMIN_OPERATIONS
        | {("post", "/sync/push")}
    )
    implemented = _implemented()
    assert implemented - covered == set(), "operations without an isolation rule"
    assert covered - implemented == set(), "rules for operations the server does not serve"


@pytest.mark.parametrize("stranger", ["cid", "root"])
def test_a_stranger_reaches_nothing_of_another_user(ada: Ada, stranger: str) -> None:
    """Cid is a user without a share; Root an administrator, who has no access to content either (ADR-0005)."""
    people, api = ada.people, ada.people.api
    if stranger == "root":
        create_user(api, people.db_url, "root@example.org", role="admin")
        people.ids["root"] = str(
            sql(people.db_url, "SELECT id FROM user_account WHERE email = 'root@example.org'")[0][0]
        )
    before = ada.state()
    secrets = ada.secrets()
    h = people.as_(stranger)

    def leaks(text: str) -> list[str]:
        try:
            body = json.loads(text)
        except ValueError:
            body = None
        if isinstance(body, dict):
            body.pop("instance", None)  # a problem names the request path, i.e. the id the caller sent
            text = json.dumps(body)
        return [s for s in secrets if s in text]

    for (method, path), call in _probes(ada, h).items():
        op = f"{method.upper()} {path}"
        response = call(api)
        if op == "POST /notifications/read":
            # Marks the caller's own notifications only; other ids are ignored (Bob's stay unread, compared below).
            assert response.status_code == 204, response.text
        elif op == "POST /trash/restore":
            # Answered per entry; the only id named is the one the caller sent.
            body = response.json()
            assert response.status_code == 200 and body["restored"] == 0, body
            assert [f["code"] for f in body["failed"]] == ["not_found"], body
            continue
        elif op == "POST /bulk":
            errors = response.json().get("errors", [])
            assert response.status_code == 422 and {e["code"] for e in errors} == {"not_found"}, response.text
        else:
            assert response.status_code in REFUSED, (op, response.status_code, response.text)
        assert leaks(response.text) == [], op

    for (method, path), urls in _lists(ada).items():
        for url in urls:
            response = api.get(url)
            assert response.status_code == 200, (method, path, response.text)
            assert leaks(response.text) == [], url

    for method, path in sorted(ADMIN_OPERATIONS if stranger == "cid" else ()):
        target = path.replace("{id}", people.ids["ada"]).replace("{action}", "disable")
        response = api.request(method.upper(), f"/api/v1{target}", json={}, headers=h)
        assert response.status_code == 403, (method, path, response.status_code, response.text)
        assert leaks(response.text) == [], path

    results = _push(api, h, *_pushes(ada, people.ids[stranger]))
    not_refused = [r for r in results if r["status"] != "rejected"]
    # Only the stranger's own note may be made.
    assert len(not_refused) == 1 and not_refused[0]["status"] == "applied", not_refused
    for r in results:
        assert leaks(json.dumps(r)) == [], r

    after = ada.state()
    # Every sign-in to look adds a session of Ada's; none of hers has ended.
    assert set(before.pop("sessions")) <= set(after.pop("sessions"))
    assert after == before
