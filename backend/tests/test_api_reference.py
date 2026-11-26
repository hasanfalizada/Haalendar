"""The API reference of the guides (docs/guide/api.md) matches the contract, and is complete and without broken links.

+++===+++ 2026-11-26 21:55 +04 — Hasan Alizada — HAAL-153 (D-129). The reference is written from api/openapi.yaml by
tests/api_reference.py; a change of the contract without rewriting it fails here, with the command that rewrites it.
"""

from __future__ import annotations

import re

from tests import api_reference
from tests.contract import operations

REWRITE = "cd backend && uv run python -m tests.api_reference"


def test_the_reference_is_the_one_the_contract_gives() -> None:
    written = api_reference.GUIDE.read_text(encoding="utf-8")
    assert written == api_reference.render(), f"docs/guide/api.md is out of date: run `{REWRITE}`"


def test_every_operation_and_schema_has_its_section() -> None:
    text = api_reference.render()
    for op in operations():
        assert op.operation_id, f"{op.method} {op.path} has no operationId"
        assert f'<a id="op-{op.operation_id.lower()}"></a>' in text, op.operation_id
        assert f"### {op.method.upper()} {op.path}\n" in text
    for name in api_reference.Reference().named:
        assert f"### {name}\n" in text, name


def test_every_link_inside_the_page_has_its_target() -> None:
    text = api_reference.render()
    anchors = set(re.findall(r'<a id="([^"]+)"></a>', text)) | {"schemas"}
    links = set(re.findall(r"\]\(#([^)]+)\)", text))
    assert links, "no link found: the pattern is wrong"
    assert not links - anchors, f"links without a target: {sorted(links - anchors)}"


def test_a_tag_says_planned_only_while_something_of_it_is() -> None:
    # Found during HAAL-153: the sync tag still called the event stream planned months after HAAL-055 served it.
    reference = api_reference.Reference()
    for tag in reference.root["tags"]:
        if "planned" not in tag.get("description", ""):
            continue
        ops = [op for _, _, _, op in reference.operations() if op["tags"][0] == tag["name"]]
        assert any("x-not-implemented" in op or op.get("x-status") == "planned" for op in ops), (
            f"tag {tag['name']} says planned, but all its operations are served"
        )
