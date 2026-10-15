"""Profile (FR-ACC-08): name / time zone / locale with If-Match, avatar upload, re-encoding, download and removal,
plus the local content-addressed storage (marker `db` except the storage unit tests).

+++===+++ 2026-10-15 — Hasan Alizada — HAAL-166.
"""

from __future__ import annotations

import io
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from haalendar.main import create_app
from haalendar.storage import LocalStorage, content_hash

from .account_helpers import create_user, login, sql
from .conftest import make_settings

MERGE = "application/merge-patch+json"


def _image(fmt: str, size: tuple[int, int] = (640, 480), **save: object) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, (15, 118, 110)).save(out, format=fmt, **save)
    return out.getvalue()


def _jpeg_with_gps() -> bytes:
    image = Image.new("RGB", (800, 600), (245, 158, 11))
    exif = Image.Exif()
    exif[0x8825] = {2: (52.0, 31.0, 12.0), 1: "N"}  # GPSInfo
    exif[0x010F] = "SecretCam"  # Make
    out = io.BytesIO()
    image.save(out, format="JPEG", exif=exif)
    return out.getvalue()


@pytest.fixture
def storage_dir(tmp_path: Path) -> Path:
    return tmp_path / "storage"


@pytest.fixture
def profile_api(clean_db: str, mail_dir: Path, storage_dir: Path) -> Iterator[TestClient]:
    app = create_app(
        make_settings(database_url=clean_db, mail_dir=str(mail_dir), storage_dir=str(storage_dir))
    )
    with TestClient(app, base_url="https://testserver", raise_server_exceptions=False) as client:
        yield client


def _signed_in(api: TestClient, db_url: str, address: str = "pia@example.org") -> dict[str, str]:
    create_user(api, db_url, address)
    status, body = login(api, address)
    assert status == 200
    token = body["csrf_token"]
    assert isinstance(token, str)
    return {"X-CSRF-Token": token}


# ---------- profile ----------


@pytest.mark.db
def test_profile_patch_with_if_match(profile_api: TestClient, clean_db: str) -> None:
    csrf = _signed_in(profile_api, clean_db)
    headers = {**csrf, "Content-Type": MERGE}
    body = {"display_name": "  Pia Profile  ", "time_zone": "Asia/Baku"}

    missing = profile_api.patch("/api/v1/me", json=body, headers=headers)
    assert missing.status_code == 428
    stale = profile_api.patch("/api/v1/me", json=body, headers={**headers, "If-Match": '"7"'})
    assert stale.status_code == 412 and stale.json()["current"]["display_name"] == "Test User"

    updated = profile_api.patch("/api/v1/me", json=body, headers={**headers, "If-Match": '"1"'})
    assert updated.status_code == 200
    me = updated.json()
    assert me["display_name"] == "Pia Profile" and me["time_zone"] == "Asia/Baku" and me["version"] == 2
    assert updated.headers["ETag"] == '"2"' and me["csrf_token"] == csrf["X-CSRF-Token"]
    same = profile_api.patch(
        "/api/v1/me", json={"display_name": "Pia Profile"}, headers={**headers, "If-Match": '"2"'}
    )
    assert same.json()["version"] == 2  # nothing changed, no new version


@pytest.mark.db
@pytest.mark.parametrize(
    ("body", "pointer"),
    [
        ({"display_name": "   "}, "/display_name"),
        ({"display_name": "x" * 81}, "/display_name"),
        ({"time_zone": "Mars/Olympus"}, "/time_zone"),
        ({"locale": "de"}, "/locale"),
        ({"email": "new@example.org"}, "/email"),
    ],
)
def test_profile_validation(
    profile_api: TestClient, clean_db: str, body: dict[str, str], pointer: str
) -> None:
    csrf = _signed_in(profile_api, clean_db)
    response = profile_api.patch(
        "/api/v1/me", json=body, headers={**csrf, "Content-Type": MERGE, "If-Match": '"1"'}
    )
    assert response.status_code == 422
    assert pointer in [e["pointer"] for e in response.json()["errors"]]


# ---------- avatar ----------


@pytest.mark.db
def test_avatar_is_reencoded_without_metadata_and_served(
    profile_api: TestClient, clean_db: str, storage_dir: Path
) -> None:
    csrf = _signed_in(profile_api, clean_db)
    response = profile_api.put(
        "/api/v1/me/avatar", content=_jpeg_with_gps(), headers={**csrf, "Content-Type": "image/jpeg"}
    )
    assert response.status_code == 200
    me = response.json()
    assert me["version"] == 2 and me["avatar_url"].startswith(f"/api/v1/users/{me['id']}/avatar?v=")

    served = profile_api.get(me["avatar_url"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/webp"
    assert served.headers["cache-control"] == "private, max-age=31536000, immutable"
    assert served.headers["x-content-type-options"] == "nosniff"
    image = Image.open(io.BytesIO(served.content))
    assert image.format == "WEBP" and image.size == (256, 256)
    assert len(image.getexif()) == 0 and b"SecretCam" not in served.content
    assert len(list(storage_dir.rglob("*.webp"))) == 1

    again = profile_api.put(
        "/api/v1/me/avatar", content=_jpeg_with_gps(), headers={**csrf, "Content-Type": "image/jpeg"}
    )
    assert again.json()["version"] == 2  # same content → same key, no new version
    assert len(list(storage_dir.rglob("*.webp"))) == 1


@pytest.mark.db
def test_avatar_visibility(profile_api: TestClient, clean_db: str) -> None:
    csrf = _signed_in(profile_api, clean_db, "owner@example.org")
    url = profile_api.put(
        "/api/v1/me/avatar", content=_image("PNG"), headers={**csrf, "Content-Type": "image/png"}
    ).json()["avatar_url"]

    _signed_in(profile_api, clean_db, "colleague@example.org")
    assert profile_api.get(url).status_code == 200  # any signed-in user of the instance

    profile_api.cookies.clear()
    assert profile_api.get(url).status_code == 401
    sql(clean_db, "UPDATE user_account SET deactivated_at = now() WHERE email = 'owner@example.org'")
    _signed_in(profile_api, clean_db, "third@example.org")
    assert profile_api.get(url).status_code == 404
    assert profile_api.get(f"/api/v1/users/{uuid.uuid4()}/avatar").status_code == 404


@pytest.mark.db
@pytest.mark.parametrize(
    ("data", "content_type", "status"),
    [
        (b"GIF89a" + b"\x00" * 64, "image/png", 415),  # signature decides; GIF is not an avatar type
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/png", 415),
        (b"\x89PNG\r\n\x1a\n" + b"broken" * 20, "image/png", 415),  # right signature, not decodable
        (b'{"a": 1}', "application/json", 415),  # only image types on this path
        (b"\xff\xd8\xff" + b"\x00" * (2 * 1024 * 1024), "image/jpeg", 413),  # over 2 MiB
    ],
)
def test_avatar_rejections(
    profile_api: TestClient, clean_db: str, data: bytes, content_type: str, status: int
) -> None:
    csrf = _signed_in(profile_api, clean_db)
    response = profile_api.put(
        "/api/v1/me/avatar", content=data, headers={**csrf, "Content-Type": content_type}
    )
    assert response.status_code == status
    assert profile_api.get("/api/v1/me").json()["avatar_url"] is None


@pytest.mark.db
def test_avatar_pixel_bomb_is_refused(profile_api: TestClient, clean_db: str) -> None:
    csrf = _signed_in(profile_api, clean_db)
    bomb = _image("PNG", (8000, 6000), optimize=True)  # 48 MP of one colour: small file, huge bitmap
    assert len(bomb) < 2 * 1024 * 1024
    response = profile_api.put(
        "/api/v1/me/avatar", content=bomb, headers={**csrf, "Content-Type": "image/png"}
    )
    assert response.status_code == 413


@pytest.mark.db
def test_avatar_removal_keeps_the_file(profile_api: TestClient, clean_db: str, storage_dir: Path) -> None:
    csrf = _signed_in(profile_api, clean_db)
    profile_api.put(
        "/api/v1/me/avatar", content=_image("WEBP"), headers={**csrf, "Content-Type": "image/webp"}
    )
    removed = profile_api.delete("/api/v1/me/avatar", headers=csrf)
    assert removed.status_code == 200 and removed.json()["avatar_url"] is None
    assert len(list(storage_dir.rglob("*.webp"))) == 1  # never deleted physically


# ---------- storage ----------


def test_local_storage_is_content_addressed_and_rejects_bad_keys(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path)
    owner = uuid.uuid4()
    first = storage.put(owner, b"abc", "image/webp")
    second = storage.put(owner, b"abc", "image/webp")
    assert first == second and first.key == f"{owner}/{content_hash(b'abc')}.webp"
    assert storage.get(first.key) == b"abc" and storage.stat(first.key) == 3
    assert not list(tmp_path.rglob(".upload-*"))
    for bad in ("../etc/passwd", f"{owner}/../../x.webp", f"{owner}/{'0' * 64}.svg"):
        with pytest.raises(ValueError, match="invalid storage key"):
            storage.get(bad)
