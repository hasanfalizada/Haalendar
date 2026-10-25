"""Temporary dependency-audit exceptions stay honest: listed with a reason in backend/audit-ignores.json, passed to
pip-audit by the root `security:audit` script, and gone once they expire or the package has moved on.

+++===+++ 2026-10-21 — Hasan Alizada — Security baseline A03: an exception must never outlive its reason.
+++===+++ 2026-10-25 — Hasan Alizada — The same for pnpm audit: `npm_ignores` must match auditConfig.ignoreGhsas in
pnpm-workspace.yaml, carry a reason and an expiry, and end once pnpm-lock.yaml no longer has the listed version.
"""

from __future__ import annotations

import json
import re
import tomllib
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
_FILE: dict[str, Any] = json.loads((ROOT / "backend" / "audit-ignores.json").read_text(encoding="utf-8"))
IGNORES: list[dict[str, Any]] = _FILE["ignores"]
NPM_IGNORES: list[dict[str, Any]] = _FILE.get("npm_ignores", [])


def _audit_script() -> str:
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
    script = scripts["security:audit"]
    assert isinstance(script, str)
    return script


def _locked(package: str) -> str | None:
    """The version of `package` in uv.lock (direct and transitive dependencies alike)."""
    lock = tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))
    for entry in lock["package"]:
        if str(entry["name"]).lower() == package:
            return str(entry["version"])
    return None


def test_the_audit_ignores_exactly_the_listed_ids() -> None:
    flagged = set(re.findall(r"--ignore-vuln (\S+)", _audit_script()))
    listed = {vuln for entry in IGNORES for vuln in entry["ids"]}
    assert flagged == listed


def test_every_exception_has_a_reason_and_has_not_expired() -> None:
    today = datetime.now(UTC).date()
    for entry in IGNORES:
        assert entry["reason"].strip() and entry["fixed_in"]
        assert today <= date.fromisoformat(entry["expires"]), (
            f"{entry['package']}: exception expired on {entry['expires']} — upgrade to {entry['fixed_in']} and remove it"
        )


def test_an_exception_ends_when_the_package_moves_on() -> None:
    for entry in IGNORES:
        assert _locked(entry["package"]) == entry["version"], (
            f"{entry['package']} is no longer {entry['version']}: remove its audit exception"
        )


def _ignored_ghsas() -> set[str]:
    """auditConfig.ignoreGhsas of pnpm-workspace.yaml (a plain list; read without a YAML dependency)."""
    lines = (ROOT / "pnpm-workspace.yaml").read_text(encoding="utf-8").splitlines()
    if "auditConfig:" not in lines:
        return set()
    found: set[str] = set()
    for line in lines[lines.index("auditConfig:") + 2 :]:
        if not line.startswith("    - "):
            break
        found.add(line.removeprefix("    - ").strip())
    return found


def test_pnpm_ignores_exactly_the_listed_ghsas() -> None:
    assert _ignored_ghsas() == {ghsa for entry in NPM_IGNORES for ghsa in entry["ids"]}


def test_every_npm_exception_has_a_reason_has_not_expired_and_ends_with_its_version() -> None:
    today = datetime.now(UTC).date()
    lock = set((ROOT / "pnpm-lock.yaml").read_text(encoding="utf-8").splitlines())
    for entry in NPM_IGNORES:
        assert entry["reason"].strip() and entry["fixed_in"]
        assert today <= date.fromisoformat(entry["expires"]), (
            f"{entry['package']}: exception expired on {entry['expires']} — upgrade to {entry['fixed_in']} and remove it"
        )
        assert f"  {entry['package']}@{entry['version']}:" in lock, (
            f"{entry['package']} is no longer {entry['version']} in pnpm-lock.yaml: remove its audit exception"
        )
