"""Image attachments (FR-X-11, D-45): upload by raw body, type by content, metadata removed, thumbnails, safe download
headers, limits (size, pixels, frames, per item), access through the item's container, soft delete with trash and audit
(marker `db`).

+++===+++ 2026-10-17 — Hasan Alizada — HAAL-040.
"""

from __future__ import annotations

import io
import uuid
from typing import Any
from urllib.parse import quote

import psycopg
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.engine import make_url

from .account_helpers import create_user, login, sql

pytestmark = pytest.mark.db


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


def _as(db_url: str, user_id: str) -> psycopg.Connection:
    conn = psycopg.connect(_dsn(db_url), autocommit=True)
    conn.execute("SELECT set_config('app.user_id', %s, false)", (user_id,))
    return conn


def png(size: tuple[int, int] = (40, 30), mode: str = "RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, "teal" if mode != "1" else 1).save(out, format="PNG")
    return out.getvalue()


def jpeg_with_gps_and_rotation() -> bytes:
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° clockwise to view
    exif[0x8825] = {1: "N", 2: (40.0, 22.0, 0.0), 3: "E", 4: (49.0, 52.0, 0.0)}  # GPS IFD (Baku)
    out = io.BytesIO()
    Image.new("RGB", (60, 20), "orange").save(out, format="JPEG", exif=exif)
    return out.getvalue()


def gif(frames: int) -> bytes:
    # Distinct frames: the GIF writer merges identical consecutive ones.
    images = [Image.new("RGB", (16, 16), (i % 256, (i * 7) % 256, (i // 256) * 60)) for i in range(frames)]
    out = io.BytesIO()
    images[0].save(out, format="GIF", save_all=True, append_images=images[1:], duration=50)
    return out.getvalue()


class World:
    def __init__(self, api: TestClient, db_url: str) -> None:
        self.api, self.db_url = api, db_url
        for name in ("ada", "bob", "cid", "dee"):
            create_user(api, db_url, f"{name}@example.org")
        self.ids = {
            str(e).split("@")[0]: str(i) for e, i in sql(db_url, "SELECT email, id FROM user_account")
        }
        self.calendar = str(uuid.uuid7())
        self.item = str(uuid.uuid7())
        with _as(db_url, self.ids["ada"]) as conn:
            conn.execute(
                "INSERT INTO calendar (id, owner_id, name) VALUES (%s, %s, 'Work')",
                (self.calendar, self.ids["ada"]),
            )
            conn.execute(
                "INSERT INTO item (id, kind, owner_id, container_kind, container_id, title) "
                "VALUES (%s, 'event', %s, 'calendar', %s, 'Dentist')",
                (self.item, self.ids["ada"], self.calendar),
            )
            for grantee, permission in (("bob", "view"), ("dee", "edit")):
                conn.execute(
                    "INSERT INTO share (id, container_kind, container_id, grantee_id, permission, granted_by) "
                    "VALUES (%s, 'calendar', %s, %s, %s, %s)",
                    (uuid.uuid7(), self.calendar, self.ids[grantee], permission, self.ids["ada"]),
                )

    def sign_in(self, name: str) -> dict[str, str]:
        self.api.cookies.clear()
        status, body = login(self.api, f"{name}@example.org")
        assert status == 200
        return {"X-CSRF-Token": str(body["csrf_token"])}

    def upload(
        self,
        headers: dict[str, str],
        data: bytes,
        *,
        name: str = "photo.png",
        media_type: str = "image/png",
        **extra: str,
    ) -> Any:
        return self.api.post(
            f"/api/v1/items/{self.item}/attachments",
            content=data,
            headers={**headers, "Content-Type": media_type, "X-File-Name": quote(name), **extra},
        )


@pytest.fixture
def world(api: TestClient, clean_db: str) -> World:
    return World(api, clean_db)


def test_upload_list_download_and_thumbnail(world: World) -> None:
    ada = world.sign_in("ada")
    response = world.upload(ada, png((800, 400)), name="Скриншот 2026.png")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["file_name"] == "Скриншот 2026.png" and body["media_type"] == "image/png"
    assert (body["width"], body["height"]) == (800, 400) and body["content_hash"].startswith("b3:")
    listed = world.api.get(f"/api/v1/items/{world.item}/attachments").json()["data"]
    assert [a["id"] for a in listed] == [body["id"]]

    file = world.api.get(body["url"])
    assert file.status_code == 200 and file.headers["content-type"] == "image/png"
    assert file.headers["x-content-type-options"] == "nosniff"
    assert file.headers["content-disposition"].startswith("inline; filename*=UTF-8''")
    assert "sandbox" in file.headers["content-security-policy"]
    thumb = world.api.get(body["thumbnail_url"])
    assert thumb.headers["content-type"] == "image/webp"
    with Image.open(io.BytesIO(thumb.content)) as image:
        assert max(image.size) == 320 and image.format == "WEBP"


def test_metadata_is_removed_and_orientation_applied(world: World) -> None:
    ada = world.sign_in("ada")
    body = world.upload(
        ada, jpeg_with_gps_and_rotation(), name="IMG_0001.JPG", media_type="image/jpeg"
    ).json()
    assert (body["width"], body["height"]) == (20, 60)  # turned upright
    with Image.open(io.BytesIO(world.api.get(body["url"]).content)) as image:
        assert image.size == (20, 60)
        assert dict(image.getexif()) == {}  # no GPS, no orientation, nothing


def test_animated_gif_is_kept_as_sent(world: World) -> None:
    ada = world.sign_in("ada")
    original = gif(3)
    body = world.upload(ada, original, name="dance.gif", media_type="image/gif").json()
    assert world.api.get(body["url"]).content == original
    assert world.api.get(body["thumbnail_url"]).headers["content-type"] == "image/webp"
    too_long = world.upload(ada, gif(301), name="long.gif", media_type="image/gif")
    assert too_long.status_code == 413


def test_type_is_decided_by_content(world: World) -> None:
    ada = world.sign_in("ada")
    fake = world.upload(ada, b"<script>alert(1)</script>" * 4, name="x.png")
    assert fake.status_code == 415 and fake.json()["code"] == "unsupported_media_type"
    svg = world.upload(
        ada, b"<svg xmlns='http://www.w3.org/2000/svg'/>", name="x.svg", media_type="image/svg+xml"
    )
    assert svg.status_code == 415
    renamed = world.upload(ada, png(), name="../../evil<>.exe", media_type="image/png")
    assert renamed.status_code == 201 and renamed.json()["file_name"] == "evil.png"
    broken = world.upload(ada, png()[:40], name="cut.png")
    assert broken.status_code == 415


def test_size_and_pixel_limits(world: World) -> None:
    ada = world.sign_in("ada")
    huge = world.upload(ada, b"\x89PNG\r\n\x1a\n" + b"0" * (10 * 1024 * 1024 + 1))
    assert huge.status_code == 413
    bomb = world.upload(ada, png((10_000, 5_000), mode="1"))  # 50 megapixels, a few kilobytes
    assert bomb.status_code == 413 and bomb.json()["code"] == "payload_too_large"


def test_at_most_twenty_per_item_and_idempotent_ids(world: World) -> None:
    ada = world.sign_in("ada")
    chosen = str(uuid.uuid7())
    first = world.upload(ada, png(), **{"X-Attachment-Id": chosen})
    again = world.upload(ada, png((10, 10)), **{"X-Attachment-Id": chosen})
    assert first.status_code == again.status_code == 201 and again.json()["id"] == chosen
    for _ in range(19):
        assert world.upload(ada, png()).status_code == 201
    limit = world.upload(ada, png())
    assert limit.status_code == 409 and limit.json()["code"] == "invalid_state"


def test_access_follows_the_container(world: World) -> None:
    ada = world.sign_in("ada")
    attachment = world.upload(ada, png()).json()

    bob = world.sign_in("bob")  # view share
    assert world.api.get(f"/api/v1/items/{world.item}/attachments").status_code == 200
    assert world.api.get(attachment["url"]).status_code == 200
    assert world.upload(bob, png()).status_code == 403
    assert world.api.delete(attachment["url"], headers=bob).status_code == 403

    cid = world.sign_in("cid")  # nothing shared
    assert world.api.get(f"/api/v1/items/{world.item}/attachments").status_code == 404
    assert world.api.get(attachment["url"]).status_code == 404
    assert world.upload(cid, png()).status_code == 404

    dee = world.sign_in("dee")  # edit share
    assert world.upload(dee, png()).status_code == 201


def test_soft_delete_trash_restore_and_audit(world: World) -> None:
    ada = world.sign_in("ada")
    attachment = world.upload(ada, png(), name="plan.png").json()
    deleted = world.api.delete(attachment["url"], headers=ada)
    assert deleted.status_code == 200 and deleted.json()["delete_batch_id"]
    assert world.api.get(f"/api/v1/items/{world.item}/attachments").json()["data"] == []
    assert world.api.get(attachment["url"]).status_code == 404
    with _as(world.db_url, world.ids["ada"]) as conn:
        kept = conn.execute(
            "SELECT deleted_at IS NOT NULL FROM attachment WHERE id = %s", (attachment["id"],)
        )
        assert kept.fetchone() == (True,)  # the row (and the file) stay

    bob = world.sign_in("bob")  # view only: may not restore
    assert world.api.get("/api/v1/trash").json()["data"] == []
    refused = world.api.post(
        "/api/v1/trash/restore",
        json={"entries": [{"type": "attachment", "id": attachment["id"]}]},
        headers=bob,
    ).json()
    assert refused["restored"] == 0 and refused["failed"][0]["code"] == "forbidden"

    ada = world.sign_in("ada")
    trash = world.api.get("/api/v1/trash").json()["data"]
    assert [(e["type"], e["title"]) for e in trash] == [("attachment", "plan.png")]
    restored = world.api.post(
        "/api/v1/trash/restore",
        json={"entries": [{"type": "attachment", "id": attachment["id"]}]},
        headers=ada,
    ).json()
    assert restored["restored"] == 1
    assert world.api.get(attachment["url"]).status_code == 200

    with _as(world.db_url, world.ids["ada"]) as conn:
        actions = [
            r[0]
            for r in conn.execute(
                "SELECT action FROM audit_log WHERE entity_type = 'attachment' AND entity_id = %s ORDER BY id",
                (attachment["id"],),
            ).fetchall()
        ]
        snapshot = conn.execute(
            "SELECT after FROM audit_log WHERE entity_id = %s AND action = 'create'", (attachment["id"],)
        ).fetchone()
    assert actions == ["create", "delete", "restore"]
    assert snapshot is not None and "storage_key" not in snapshot[0]
