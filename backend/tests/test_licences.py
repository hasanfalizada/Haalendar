"""Licence gate (scripts/dev/licences.py, backend/licence-policy.json): how expressions and exceptions are judged.

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. The gate itself runs over the real dependencies in check-all
(`pnpm security:licences`); these tests pin its rules: SPDX expressions, exceptions by package and licence, tooling-only
exceptions that must not ship, exceptions that are no longer needed, and the policy file's own shape.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from email.message import Message
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("licences", ROOT / "scripts" / "dev" / "licences.py")
assert _spec and _spec.loader
licences: Any = importlib.util.module_from_spec(_spec)
sys.modules["licences"] = licences  # its dataclass looks its module up
_spec.loader.exec_module(licences)

PERMITTED = {"MIT", "Apache-2.0", "BSD-3-Clause", "CC0-1.0"}


@pytest.mark.parametrize(
    ("expression", "ok"),
    [
        ("MIT", True),
        ("MPL-2.0", False),
        ("MIT OR MPL-2.0", True),
        ("MPL-2.0 OR MIT", True),
        ("MIT AND MPL-2.0", False),
        ("MIT AND Apache-2.0", True),
        ("(MIT OR CC0-1.0)", True),
        ("Apache-2.0 WITH LLVM-exception", True),
        ("(MIT OR GPL-3.0-only) AND (Apache-2.0 OR LGPL-3.0-only)", True),
        ("(MIT AND GPL-3.0-only) OR LGPL-3.0-only", False),
        ("", False),
        ("UNKNOWN", False),
        ("(MIT", False),
    ],
)
def test_an_expression_is_allowed_as_a_whole(expression: str, ok: bool) -> None:
    assert licences.allowed(expression, PERMITTED) is ok


def _package(name: str, licence: str, shipped: bool = False, ecosystem: str = "npm") -> Any:
    return licences.Package(ecosystem, name, "1.0.0", licence, shipped)


def _policy(*exceptions: dict[str, Any]) -> dict[str, Any]:
    return {"allowed": sorted(PERMITTED), "exceptions": list(exceptions)}


TOOL_ONLY = {"ecosystem": "npm", "package": "lightningcss*", "licence": "MPL-2.0", "shipped": False}


def test_exceptions_by_package_and_licence_tooling_only_and_no_longer_needed() -> None:
    assert licences.check([_package("left-pad", "MIT")], _policy()) == []
    assert licences.check([_package("lib", "GPL-3.0-only")], _policy()) == [
        "npm lib@1.0.0: GPL-3.0-only is not allowed"
    ]
    # A pattern matches the platform packages; the licence must be the one decided.
    platform = [_package("lightningcss", "MPL-2.0"), _package("lightningcss-linux-arm64-gnu", "MPL-2.0")]
    assert licences.check(platform, _policy(TOOL_ONLY)) == []
    assert licences.check([_package("lightningcss", "GPL-3.0-only")], _policy(TOOL_ONLY)) == [
        "npm lightningcss@1.0.0: GPL-3.0-only is not allowed",
        "exception no longer needed: npm lightningcss* (MPL-2.0)",
    ]
    # The same name in the other ecosystem is another package.
    assert licences.check([_package("lightningcss", "MPL-2.0", ecosystem="python")], _policy(TOOL_ONLY))[
        0
    ] == ("python lightningcss@1.0.0: MPL-2.0 is not allowed")
    shipped = licences.check([_package("lightningcss", "MPL-2.0", shipped=True)], _policy(TOOL_ONLY))
    assert shipped == [
        "npm lightningcss@1.0.0: MPL-2.0 is allowed only in tooling, but the package now ships with the app"
    ]
    assert licences.check([], _policy(TOOL_ONLY)) == [
        "exception no longer needed: npm lightningcss* (MPL-2.0)"
    ]


def _metadata(**fields: str | list[str]) -> Message:
    message = Message()
    for key, value in fields.items():
        for item in value if isinstance(value, list) else [value]:
            message[key.replace("_", "-")] = item
    return message


def test_python_licences_from_expression_field_or_classifiers() -> None:
    known = PERMITTED | {"MPL-2.0"}
    assert (
        licences.python_licence(_metadata(License_Expression="MIT OR Apache-2.0"), known)
        == "MIT OR Apache-2.0"
    )
    assert (
        licences.python_licence(_metadata(License="CC0-1.0 OR Apache-2.0"), known) == "CC0-1.0 OR Apache-2.0"
    )
    dual = _metadata(
        License="Dual licensed, see LICENSE",
        Classifier=[
            "License :: OSI Approved :: MIT License",
            "License :: OSI Approved :: Apache Software License",
        ],
    )
    assert licences.python_licence(dual, known) == "MIT OR Apache-2.0"
    assert licences.python_licence(_metadata(License="Some custom terms"), known) == "UNKNOWN"
    mpl = _metadata(Classifier="License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)")
    assert licences.python_licence(mpl, known) == "MPL-2.0"


def test_the_policy_file_names_a_reason_for_every_exception() -> None:
    policy = json.loads((ROOT / "backend" / "licence-policy.json").read_text(encoding="utf-8"))
    assert {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "PostgreSQL"} <= set(policy["allowed"])
    assert not {"MPL-2.0", "LGPL-3.0-only", "GPL-3.0-only"} & set(policy["allowed"])
    for exception in policy["exceptions"]:
        assert set(exception) == {"ecosystem", "package", "licence", "shipped", "reason"}, exception
        assert exception["ecosystem"] in ("python", "npm") and isinstance(exception["shipped"], bool)
        assert "Owner, 2026-11-01" in exception["reason"], exception
