"""Data export (FR-X-14, D-48, Google-Takeout style): request with password confirmation, one at a time, queued job,
archive built by the worker (archive.json valid against the published schema, deleted records with deleted_at, only
what the user owns, attachment metadata without storage keys, images on request, iCalendar files, README), e-mail,
download, expiry (archive removed, request kept), owner-only access (marker `db` except the pure writer tests).

+++===+++ 2026-10-18 — Hasan Alizada — HAAL-043.
"""

from __future__ import annotations

import asyncio
import io
import json
import uuid
import zipfile
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import psycopg
import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from PIL import Image
from sqlalchemy.engine import make_url

from haalendar.exports.archive import safe_name
from haalendar.exports.service import build
from haalendar.planning.ics import IcsEvent, calendar_ics

from .account_helpers import PASSWORD, create_user, login, sql, sql_maintenance
from .conftest import make_settings

SCHEMA = json.loads(
    (
        Path(__file__).resolve().parents[1]
        / "src"
        / "haalendar"
        / "exports"
        / "haalendar-export-1.0.schema.json"
    ).read_text(encoding="utf-8")
)


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def _as(db_url: str, user_id: str) -> psycopg.Connection:
    conn = psycopg.connect(_dsn(db_url), autocommit=True)
    conn.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
    return conn


def _png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (30, 20), "teal").save(out, format="PNG")
    return out.getvalue()


class World:
    def __init__(self, api: TestClient, db_url: str, mail_dir: Path) -> None:
        self.api, self.db_url, self.mail_dir = api, db_url, mail_dir
        for name in ("ada", "bob"):
            create_user(api, db_url, f"{name}@example.org")
        self.ids = {
            str(e).split("@")[0]: str(i) for e, i in sql(db_url, "SELECT email, id FROM user_account")
        }
        self.cal = {"Work": str(uuid.uuid7()), "Old": str(uuid.uuid7()), "Bobs": str(uuid.uuid7())}
        self.items = {"Dentist": str(uuid.uuid7()), "Ada in Bobs": str(uuid.uuid7())}
        with _as(db_url, self.ids["ada"]) as conn:
            for name in ("Work", "Old"):
                conn.execute(
                    "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, %s)",
                    (self.cal[name], self.ids["ada"], name),
                )
            conn.execute(
                "UPDATE calendar SET deleted_at = now(), delete_batch_id = %s, updated_by = %s WHERE id = %s",
                (uuid.uuid7(), self.ids["ada"], self.cal["Old"]),
            )
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title) "
                "VALUES (%s, 'event', %s, 'calendar', %s, 'Dentist')",
                (self.items["Dentist"], self.ids["ada"], self.cal["Work"]),
            )
            # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100. A note of Ada's (the To-Do section).
            self.items["Shopping"] = str(uuid.uuid7())
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title, color) "
                "VALUES (%s, 'note', %s, 'note', %s, 'Shopping', 'yellow')",
                (self.items["Shopping"], self.ids["ada"], self.items["Shopping"]),
            )
            conn.execute(
                "INSERT INTO note (id, container_kind, container_id, pinned, position) "
                "VALUES (%s, 'note', %s, true, 'U')",
                (self.items["Shopping"], self.items["Shopping"]),
            )
            # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-101. One checklist item of it.
            self.items["Milk"] = str(uuid.uuid7())
            conn.execute(
                "INSERT INTO checklist_item (id, item_id, container_kind, container_id, text, position, created_by) "
                "VALUES (%s, %s, 'note', %s, 'Milk', 'U', %s)",
                (self.items["Milk"], self.items["Shopping"], self.items["Shopping"], self.ids["ada"]),
            )
            # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. One Kanban board, archived.
            self.items["Revamp"] = str(uuid.uuid7())
            conn.execute(
                "INSERT INTO board (id, owner_id, name, position, archived_at) VALUES (%s, %s, 'Revamp', 'U', now())",
                (self.items["Revamp"], self.ids["ada"]),
            )
            # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-111. With one column.
            self.items["Doing"] = str(uuid.uuid7())
            conn.execute(
                "INSERT INTO board_column (id, board_id, container_kind, container_id, name, position, wip_limit, "
                "created_by) VALUES (%s, %s, 'board', %s, 'Doing', 'U', 3, %s)",
                (self.items["Doing"], self.items["Revamp"], self.items["Revamp"], self.ids["ada"]),
            )
            # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-112. A card in it with a board label.
            self.items["Release"], self.items["Urgent"] = str(uuid.uuid7()), str(uuid.uuid7())
            revamp, doing = self.items["Revamp"], self.items["Doing"]
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title) "
                "VALUES (%s, 'card', %s, 'board', %s, 'Release')",
                (self.items["Release"], self.ids["ada"], revamp),
            )
            conn.execute(
                "INSERT INTO card (id, container_kind, container_id, board_id, column_id, position, due_date, "
                "due_time) VALUES (%s, 'board', %s, %s, %s, 'U', '2026-11-10', '09:30')",
                (self.items["Release"], revamp, revamp, doing),
            )
            conn.execute(
                "INSERT INTO label (id, board_id, container_kind, container_id, name, color, created_by) "
                "VALUES (%s, %s, 'board', %s, 'Urgent', 'red', %s)",
                (self.items["Urgent"], revamp, revamp, self.ids["ada"]),
            )
            conn.execute(
                "INSERT INTO item_label (id, item_id, label_id, container_kind, container_id, created_by) "
                "VALUES (%s, %s, %s, 'board', %s, %s)",
                (uuid.uuid7(), self.items["Release"], self.items["Urgent"], revamp, self.ids["ada"]),
            )
        with _as(db_url, self.ids["bob"]) as conn:
            conn.execute(
                "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Bobs')",
                (self.cal["Bobs"], self.ids["bob"]),
            )
            conn.execute(
                "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                "VALUES (%s, 'calendar', %s, %s, 'edit', %s)",
                (uuid.uuid7(), self.cal["Bobs"], self.ids["ada"], self.ids["bob"]),
            )
        with _as(
            db_url, self.ids["ada"]
        ) as conn:  # Ada creates an item in Bob's calendar: Bob exports it, not Ada
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title) "
                "VALUES (%s, 'event', %s, 'calendar', %s, 'Ada in Bobs')",
                (self.items["Ada in Bobs"], self.ids["ada"], self.cal["Bobs"]),
            )

    def sign_in(self, name: str) -> dict[str, str]:
        self.api.cookies.clear()
        status, body = login(self.api, f"{name}@example.org")
        assert status == 200
        return {"X-CSRF-Token": str(body["csrf_token"])}

    def reauth(self, headers: dict[str, str]) -> None:
        response = self.api.post("/api/v1/auth/reauth", json={"password": PASSWORD}, headers=headers)
        assert response.status_code == 204, response.text

    def attach(self, headers: dict[str, str], item: str) -> dict[str, Any]:
        response = self.api.post(
            f"/api/v1/items/{self.items[item]}/attachments",
            content=_png(),
            headers={**headers, "Content-Type": "image/png", "X-File-Name": quote("plan.png")},
        )
        assert response.status_code == 201, response.text
        body: dict[str, Any] = response.json()
        return body

    def request(self, headers: dict[str, str], **body: Any) -> Any:
        return self.api.post(
            "/api/v1/exports", json={"modules": ["calendar", "todo", "kanban"], **body}, headers=headers
        )

    def run_worker(self, export_id: str, owner: str) -> None:
        settings = make_settings(database_url=self.db_url, mail_dir=str(self.mail_dir))
        asyncio.run(build(settings, uuid.UUID(export_id), uuid.UUID(self.ids[owner])))


@pytest.fixture
def world(api: TestClient, clean_db: str, mail_dir: Path) -> World:
    return World(api, clean_db, mail_dir)


@pytest.mark.db
def test_request_needs_password_confirmation_and_runs_one_at_a_time(world: World, owner_db_url: str) -> None:
    ada = world.sign_in("ada")
    # Signing in counts as a fresh confirmation; once the 15-minute window has passed the password is asked again.
    sql_maintenance(owner_db_url, "UPDATE session SET reauth_at = now() - interval '1 hour'")
    refused = world.request(ada)
    assert refused.status_code == 403 and refused.json()["code"] == "reauth_required"
    world.reauth(ada)
    queued = world.request(ada, include_images=True)
    assert queued.status_code == 202, queued.text
    body = queued.json()
    assert (
        body["status"] == "queued"
        and body["modules"] == ["calendar", "todo", "kanban"]
        and body["include_images"]
    )
    job = sql(world.db_url, "SELECT task_name, args::text, status::text FROM procrastinate_jobs")
    assert (
        len(job) == 1 and job[0][0] == "build_export" and body["id"] in str(job[0][1]) and job[0][2] == "todo"
    )
    again = world.request(ada)
    assert again.status_code == 409 and again.json()["code"] == "invalid_state"
    invalid = world.api.post("/api/v1/exports", json={"modules": []}, headers=ada)
    assert invalid.status_code == 422


@pytest.mark.db
def test_archive_holds_what_the_user_owns_valid_against_the_schema(world: World) -> None:
    ada = world.sign_in("ada")
    attachment = world.attach(ada, "Dentist")
    world.attach(ada, "Ada in Bobs")
    world.reauth(ada)
    export = world.request(ada, include_images=True).json()
    world.run_worker(export["id"], "ada")

    listed = world.api.get("/api/v1/exports").json()["data"]
    assert listed[0]["status"] == "ready" and listed[0]["download_url"].endswith("/download")
    # +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. The ready export is announced in the notification center.
    notes = world.api.get("/api/v1/notifications").json()
    ready = [n for n in notes["data"] if n["kind"] == "export_ready"]
    assert len(ready) == 1 and ready[0]["payload"]["export_id"] == export["id"] and notes["unread_count"] >= 1
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. Ada's default calendar ("My calendar", D-82) counts too.
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-100 / HAAL-101. The To-Do section: a note with one checklist item.
    # +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. The Kanban section: one board.
    assert listed[0]["counts"] == {
        "calendars": 3,
        "attachments": 1,
        "notes": 1,
        "checklist_items": 1,
        "boards": 1,
        "labels": 1,
    }
    response = world.api.get(listed[0]["download_url"])
    assert response.status_code == 200 and response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"].startswith('attachment; filename="haalendar-export-')

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = set(archive.namelist())
        document = json.loads(archive.read("archive.json"))
        Draft202012Validator(SCHEMA).validate(document)
        assert json.loads(archive.read("schema/haalendar-export-1.0.schema.json")) == SCHEMA
        assert b"<h1>Haalendar export</h1>" in archive.read("README.html")
        ics = [n for n in names if n.startswith("calendar/") and n.endswith(".ics")]
        assert sorted(ics)[1:] == [f"calendar/Work ({world.cal['Work'][:8]}).ics"]  # live calendars only
        assert sorted(ics)[0].startswith("calendar/My calendar (")
        assert archive.read(sorted(ics)[1]).startswith(b"BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
        image = [n for n in names if n.startswith("calendar/attachments/")]
        assert image == [f"calendar/attachments/{attachment['id'][:8]}-plan.png"]

    assert document["user"]["email"] == "ada@example.org"
    # +++===+++ 2026-10-19 — Hasan Alizada — HAAL-045. The settings travel with the export.
    assert document["settings"]["week_start"] == 1 and document["settings"]["week_ab"]["labels"] == ["A", "B"]
    calendars = {c["name"]: c for c in document["calendars"]}
    # Not Bob's calendar, even though it is shared with Ada.
    assert set(calendars) == {"My calendar", "Work", "Old"}
    assert calendars["Old"]["deleted_at"] and "deleted_at" not in calendars["Work"]
    assert [a["id"] for a in document["attachments"]] == [attachment["id"]]  # not the one in Bob's calendar
    exported = document["attachments"][0]
    assert exported["archive_path"] == f"calendar/attachments/{attachment['id'][:8]}-plan.png"
    assert "storage_key" not in exported and "thumbnail_key" not in exported
    assert document["events"] == []
    [board] = document["boards"]
    assert (board["id"], board["name"], board["position"], board["permission"]) == (
        world.items["Revamp"],
        "Revamp",
        "U",
        "owner",
    )
    assert board["archived_at"] and "deleted_at" not in board
    [column] = board["columns"]
    assert (column["id"], column["name"], column["wip_limit"]) == (world.items["Doing"], "Doing", 3)
    [card] = column["cards"]
    assert (card["title"], card["due_date"], card["due_time"], card["label_ids"]) == (
        "Release",
        "2026-11-10",
        "09:30",
        [world.items["Urgent"]],
    )
    assert [(label["name"], label["color"]) for label in document["labels"]] == [("Urgent", "red")]
    [note] = document["notes"]
    assert (note["id"], note["title"], note["color"], note["pinned"], note["position"]) == (
        world.items["Shopping"],
        "Shopping",
        "yellow",
        True,
        "U",
    )
    assert note.get("archived_at") is None and note["permission"] == "owner"
    [milk] = document["checklist_items"]
    assert (milk["item_id"], milk["text"], milk["checked"], milk["position"]) == (
        world.items["Shopping"],
        "Milk",
        False,
        "U",
    )

    mails = list(world.mail_dir.glob("*.eml"))
    assert any("your data export is ready" in m.read_text(encoding="utf-8") for m in mails)


@pytest.mark.db
def test_expiry_removes_the_archive_but_keeps_the_request(world: World, owner_db_url: str) -> None:
    ada = world.sign_in("ada")
    world.reauth(ada)
    export = world.request(ada).json()
    world.run_worker(export["id"], "ada")
    key = sql(owner_db_url, "SELECT file_key FROM export_request WHERE id = %s", export["id"])[0][0]
    path = Path(make_settings().storage_dir) / str(key)
    assert path.is_file()

    sql_maintenance(owner_db_url, "UPDATE export_request SET expires_at = now() - interval '1 minute'")
    listed = world.api.get("/api/v1/exports").json()["data"]
    assert listed[0]["status"] == "expired" and "download_url" not in listed[0]
    assert not path.exists()
    assert world.api.get(f"/api/v1/exports/{export['id']}/download").status_code == 409
    world.reauth(ada)
    assert world.request(ada).status_code == 202  # a new export after the old one is done


@pytest.mark.db
def test_exports_belong_to_their_owner(world: World) -> None:
    ada = world.sign_in("ada")
    world.reauth(ada)
    export = world.request(ada).json()
    world.run_worker(export["id"], "ada")
    world.sign_in("bob")
    assert world.api.get("/api/v1/exports").json()["data"] == []
    assert world.api.get(f"/api/v1/exports/{export['id']}/download").status_code == 404


# +++===+++ 2026-10-29 — Hasan Alizada — HAAL-095. The writer is haalendar.planning.ics now (icalendar library, D-83):
# the same promises, plus VTIMEZONE for the zone used and UNTIL / EXDATE.
def test_icalendar_writer_escapes_folds_and_uses_crlf() -> None:
    stamp = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
    text = calendar_ics(
        "Work; team",
        [
            IcsEvent(
                uid="e1",
                summary="Review, plan; ship\\now",
                start=date(2026, 10, 20),
                end=date(2026, 10, 21),
                all_day=True,
                description="Line one\nLine two " + "x" * 80,
            ),
            IcsEvent(
                uid="e2",
                summary="Call",
                start=datetime(2026, 10, 20, 9, 30),
                end=datetime(2026, 10, 20, 10, 0),
                all_day=False,
                tzid="Asia/Baku",
                rrule="FREQ=WEEKLY;BYDAY=TU;UNTIL=20261124",
                exdates=(date(2026, 10, 27),),
            ),
        ],
        stamp,
    )
    lines = text.split("\r\n")
    assert lines[0] == "BEGIN:VCALENDAR" and lines[-2] == "END:VCALENDAR" and lines[-1] == ""
    assert "X-WR-CALNAME:Work\\; team" in lines
    assert "SUMMARY:Review\\, plan\\; ship\\\\now" in lines
    assert "DTSTART;VALUE=DATE:20261020" in lines and "DTSTAMP:20261018T090000Z" in lines
    assert "DTSTART;TZID=Asia/Baku:20261020T093000" in lines
    assert "RRULE:FREQ=WEEKLY;UNTIL=20261124T195959Z;BYDAY=TU" in lines  # end of 24 Nov in Baku (UTC+4)
    assert "EXDATE;TZID=Asia/Baku:20261027T093000" in lines
    assert "BEGIN:VTIMEZONE" in lines and "TZID:Asia/Baku" in lines
    assert all(len(line.encode("utf-8")) <= 75 for line in lines)
    assert any(line.startswith(" ") for line in lines)  # the long description continues on folded lines


def test_file_names_are_safe_everywhere() -> None:
    assert safe_name('Work/Home: "A"*?') == "WorkHome A"
    assert safe_name("...") == "untitled"
    assert safe_name("Календарь", ".ics") == "Календарь.ics"
