"""The atom registry is consistent (ADR-0006): what CI verifies on every push.

+++===+++ 2026-11-08 — Hasan Alizada — HAAL-151. project.manifest.json is valid against manifest.schema.json; every file
it names exists; each atom's hash is BLAKE3 over its contract.json and vectors.json; every vector's input and output
are valid against the contract's schemas and every expected error is one the contract lists; an atom's implementation
imports another atom's implementation only when the manifest lists that atom in its deps.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from blake3 import blake3
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
MANIFEST: dict[str, Any] = json.loads((ROOT / "project.manifest.json").read_text(encoding="utf-8"))
ATOMS: list[dict[str, Any]] = MANIFEST["atoms"]
IDS = [atom["id"] for atom in ATOMS]


def _json(path: str) -> Any:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def test_the_manifest_is_valid_against_its_schema() -> None:
    schema = json.loads((ROOT / "manifest.schema.json").read_text(encoding="utf-8"))
    errors = [
        f"{list(e.absolute_path)}: {e.message}" for e in Draft202012Validator(schema).iter_errors(MANIFEST)
    ]
    assert errors == []


@pytest.mark.parametrize("atom", ATOMS, ids=IDS)
def test_every_file_of_an_atom_exists(atom: dict[str, Any]) -> None:
    paths = [
        atom["contract"],
        atom["examples"],
        atom["vectors"],
        *atom["tests_ref"].values(),
        *atom["impl_ref"].values(),
    ]
    assert [path for path in paths if not (ROOT / path).is_file()] == []
    assert set(atom["deps"]) <= set(IDS)


@pytest.mark.parametrize("atom", ATOMS, ids=IDS)
def test_the_hash_is_blake3_of_contract_and_vectors(atom: dict[str, Any]) -> None:
    digest = blake3(
        (ROOT / atom["contract"]).read_bytes() + (ROOT / atom["vectors"]).read_bytes()
    ).hexdigest()
    assert atom["hash"] == f"b3:{digest}", (
        "contract or vectors changed: update the hash (atoms/README.md, step 5)"
    )


@pytest.mark.parametrize("atom", ATOMS, ids=IDS)
def test_every_vector_matches_the_contract(atom: dict[str, Any]) -> None:
    contract = _json(atom["contract"])
    vectors = _json(atom["vectors"])
    assert vectors["atom"] == atom["id"] == contract["id"]
    inputs = Draft202012Validator(contract["input"])
    outputs = Draft202012Validator(contract["output"])
    codes = {error["code"] for error in contract["errors"]}
    problems: list[str] = []
    for case in vectors["cases"]:
        problems += [f"{case['name']} input: {e.message}" for e in inputs.iter_errors(case["input"])]
        if "error" in case:
            if case["error"] not in codes:
                problems.append(f"{case['name']}: error {case['error']} is not in the contract")
        else:
            problems += [f"{case['name']} output: {e.message}" for e in outputs.iter_errors(case["output"])]
    assert problems == []


def _python_module(path: str) -> str:
    return path.removeprefix("backend/src/").removesuffix(".py").replace("/", ".")


def _imports_of(path: str) -> set[str]:
    """The implementation files of other atoms that this implementation file imports."""
    text = (ROOT / path).read_text(encoding="utf-8")
    found: set[str] = set()
    if path.endswith(".py"):
        for module in re.findall(r"^\s*(?:from|import)\s+([\w.]+)", text, re.MULTILINE):
            found.add(module)
        return found
    folder = (ROOT / path).parent
    for spec in re.findall(r"""(?:from|import)\s*["']([^"']+)["']""", text):
        if spec.startswith("."):
            found.add(str((folder / spec).resolve().relative_to(ROOT)))
        elif spec.startswith("@/"):
            found.add("frontend/src/" + spec.removeprefix("@/"))
    return found


@pytest.mark.parametrize("atom", ATOMS, ids=IDS)
def test_an_implementation_imports_other_atoms_only_through_its_deps(atom: dict[str, Any]) -> None:
    allowed = set(atom["deps"]) | {atom["id"]}
    owners: dict[str, set[str]] = {}
    for other in ATOMS:
        python = _python_module(other["impl_ref"]["python"])
        typescript = other["impl_ref"]["typescript"].removesuffix(".ts")
        for key in (python, typescript):
            owners.setdefault(key, set()).add(other["id"])
    bad: list[str] = []
    for path in atom["impl_ref"].values():
        for imported in _imports_of(path):
            atoms = owners.get(imported.removesuffix(".ts"), set())
            # A file shared by several versions of one atom (recurrence v1 and v2) belongs to all of them.
            if atoms and not atoms & allowed:
                bad.append(f"{path} imports {imported} ({', '.join(sorted(atoms))})")
    assert bad == []


def test_the_import_check_sees_an_undeclared_import() -> None:
    """Without its deps entry the event-days atom's import of local-to-UTC is refused (the check is not a no-op)."""
    event_days = next(atom for atom in ATOMS if atom["id"] == "time.event_days.v1")
    assert "time.local_to_utc.v1" in event_days["deps"]
    with pytest.raises(AssertionError, match="local_to_utc"):
        test_an_implementation_imports_other_atoms_only_through_its_deps({**event_days, "deps": []})
