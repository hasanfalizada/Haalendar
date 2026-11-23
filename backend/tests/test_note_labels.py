"""Personal labels for notes (FR-TODO-04, D-109): each user has labels of their own, puts them on any note they read
(their own or one shared with them) and nobody else sees them; names are unique per user, at most 100 labels and 20 of
them on one note; deleting a label takes it off every note, a note's delete takes its owner's labels along and its
restore brings them back. Marker `db`.

+++===+++ 2026-11-16 21:24 +04 — Hasan Alizada — HAAL-102.
"""

from __future__ import annotations

import uuid
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient

from .test_isolation import as_user
from .test_notes import _create
from .test_sharing import People
from .test_sync import _m, _pull, _push

pytestmark = pytest.mark.db


@pytest.fixture
def people(api: TestClient, clean_db: str) -> People:
    return People(api, clean_db)


def _rows(people: People, kind: str) -> dict[str, dict[str, Any]]:
    return {c["entity_id"]: c["data"] for c in _pull(people.api)["changes"] if c["entity_type"] == kind}


def _status(result: dict[str, Any]) -> tuple[str, int | None]:
    return result["status"], (result.get("problem") or {}).get("status")


def _label(people: People, headers: dict[str, str], name: str, **data: Any) -> tuple[str, dict[str, Any]]:
    label = str(uuid.uuid7())
    result = _push(people.api, headers, _m("label", label, "create", data={"name": name, **data}))[0]
    return label, result


def _put(people: People, headers: dict[str, str], item: str, label: str) -> tuple[str, dict[str, Any]]:
    row = str(uuid.uuid7())
    result = _push(
        people.api, headers, _m("item_label", row, "create", data={"item_id": item, "label_id": label})
    )
    return row, result[0]


def _live(people: People, user: str, row: str) -> bool:
    with as_user(people.db_url, uuid.UUID(people.ids[user])) as conn:
        found = conn.execute("SELECT deleted_at IS NULL FROM item_label WHERE id = %s", (row,)).fetchone()
    assert found is not None
    return bool(found[0])


def test_a_personal_label_belongs_to_its_user(people: People) -> None:
    ada = people.as_("ada")
    home, made = _label(people, ada, " Home ", color="green")
    assert made["status"] == "applied", made
    for data, status in (({"name": "home"}, 409), ({"name": " "}, 422), ({"name": "x" * 41}, 422)):
        assert _status(_label(people, ada, **data)[1]) == ("rejected", status), data
    row = _rows(people, "label")[home]
    assert (row["name"], row["color"], row["board_id"], row["container_kind"]) == (
        "Home",
        "green",
        None,
        "user",
    )
    renamed = _push(
        people.api,
        ada,
        _m("label", home, "update", base={"name": "Home", "color": "green"}, data={"name": "House"}),
    )[0]
    assert renamed["status"] == "applied", renamed

    # Bob sees none of it, may use the same name and cannot change Ada's label.
    bob = people.as_("bob")
    assert home not in _rows(people, "label")
    assert _label(people, bob, "House")[1]["status"] == "applied"
    for mutation in (
        _m("label", home, "update", base={"name": "House"}, data={"name": "Bob's"}),
        _m("label", home, "delete"),
    ):
        assert _status(_push(people.api, bob, mutation)[0]) == ("rejected", 404), mutation


def test_labels_on_own_notes_and_on_notes_shared_with_the_user(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada, title="Trip")
    trips, _ = _label(people, ada, "Trips")
    on, put = _put(people, ada, note, trips)
    assert put["status"] == "applied", put
    assert _status(_put(people, ada, note, trips)[1]) == ("rejected", 409)
    assert (
        people.share(ada, "bob@example.org", "view", container_kind="note", container_id=note).status_code
        == 201
    )

    # Bob reads the note through a view share: he labels it for himself, and does not see Ada's label on it.
    bob = people.as_("bob")
    assert on not in _rows(people, "item_label") and trips not in _rows(people, "label")
    later, _ = _label(people, bob, "Later")
    mine, put = _put(people, bob, note, later)
    assert put["status"] == "applied", put
    assert _rows(people, "item_label")[mine]["item_id"] == note
    assert _status(_put(people, bob, note, trips)[1]) == ("rejected", 404)  # Ada's label is not his
    assert _status(_push(people.api, bob, _m("item_label", on, "delete"))[0]) == ("rejected", 404)
    people.as_("ada")
    assert mine not in _rows(people, "item_label")

    # Cid does not read the note: he cannot label it.
    cid = people.as_("cid")
    own, _ = _label(people, cid, "Cid")
    assert _status(_put(people, cid, note, own)[1]) == ("rejected", 404)


def test_a_personal_label_goes_on_notes_only_and_a_board_label_on_cards_only(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    calendar_event = str(uuid.uuid7())
    event = {
        "kind": "event",
        "container_kind": "calendar",
        "container_id": people.calendar,
        "title": "Dentist",
        "all_day": True,
        "start_date": "2026-11-20",
        "end_date": "2026-11-20",
    }
    assert _push(people.api, ada, _m("item", calendar_event, "create", data=event))[0]["status"] == "applied"
    home, _ = _label(people, ada, "Home")
    assert _status(_put(people, ada, calendar_event, home)[1]) == ("rejected", 422)
    board = str(uuid.uuid7())
    _push(people.api, ada, _m("board", board, "create", data={"name": "Plans", "position": "U"}))
    urgent, made = _label(people, ada, "Urgent", board_id=board)
    assert made["status"] == "applied", made
    assert _status(_put(people, ada, note, urgent)[1]) == ("rejected", 422)


def test_limits_of_labels(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada)
    made = [_m("label", str(uuid.uuid7()), "create", data={"name": f"L{n}"}) for n in range(100)]
    assert all(r["status"] == "applied" for r in _push(people.api, ada, *made))
    assert _status(_label(people, ada, "One more")[1]) == ("rejected", 409)
    puts = [
        _m("item_label", str(uuid.uuid7()), "create", data={"item_id": note, "label_id": m["entity_id"]})
        for m in made[:21]
    ]
    results = _push(people.api, ada, *puts)
    assert [r["status"] for r in results].count("applied") == 20
    assert _status(results[20]) == ("rejected", 409)
    # A removed label frees its place on the note; restoring it again finds no room while the note is full.
    assert _push(people.api, ada, _m("item_label", puts[0]["entity_id"], "delete"))[0]["status"] == "applied"
    again = {**puts[20], "mutation_id": str(uuid.uuid7())}
    assert _push(people.api, ada, again)[0]["status"] == "applied"
    assert _status(_push(people.api, ada, _m("item_label", puts[0]["entity_id"], "restore"))[0]) == (
        "rejected",
        409,
    )


def test_deleting_a_label_or_a_note_takes_the_labels_along(people: People) -> None:
    ada = people.as_("ada")
    note, _ = _create(people, ada, title="Trip")
    trips, _ = _label(people, ada, "Trips")
    on, _ = _put(people, ada, note, trips)
    assert _push(people.api, ada, _m("label", trips, "delete"))[0]["status"] == "applied"
    assert _live(people, "ada", on) is False
    assert _push(people.api, ada, _m("label", trips, "restore"))[0]["status"] == "applied"
    assert _live(people, "ada", on) is True

    # Bob labels the shared note too; Ada's delete takes her label along, not his; the trash brings hers back.
    assert (
        people.share(ada, "bob@example.org", "edit", container_kind="note", container_id=note).status_code
        == 201
    )
    bob = people.as_("bob")
    later, _ = _label(people, bob, "Later")
    his, _ = _put(people, bob, note, later)
    ada = people.as_("ada")
    assert _push(people.api, ada, _m("item", note, "delete"))[0]["status"] == "applied"
    assert (_live(people, "ada", on), _live(people, "bob", his)) == (False, True)
    restored = people.api.post(
        "/api/v1/trash/restore", json={"entries": [{"type": "note", "id": note}]}, headers=ada
    ).json()
    assert restored["restored"] == 1, restored
    assert (_live(people, "ada", on), _live(people, "bob", his)) == (True, True)


def test_row_level_security_keeps_personal_labels_to_their_user(people: People) -> None:
    ada = people.as_("ada")
    home, _ = _label(people, ada, "Home")
    # As the application role with Bob as the current user: Ada's label is invisible and cannot be forged for her.
    with as_user(people.db_url, uuid.UUID(people.ids["bob"])) as conn:
        assert conn.execute("SELECT count(*) FROM label WHERE id = %s", (home,)).fetchone() == (0,)
        # Live updates of a personal label go to its user only.
        audience = conn.execute("SELECT haalendar_sync_audience('user', %s)", (people.ids["ada"],)).fetchall()
        assert [str(row[0]) for row in audience] == [people.ids["ada"]]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "INSERT INTO label (id, container_kind, container_id, name, color, created_by) "
                "VALUES (%s, 'user', %s, 'Forged', 'red', %s)",
                (uuid.uuid7(), people.ids["ada"], people.ids["bob"]),
            )
