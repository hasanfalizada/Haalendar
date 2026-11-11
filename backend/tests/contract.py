"""The HTTP contract (api/openapi.yaml) as the tests see it: its operations and the schemas of their responses.

+++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Contract conformance (ADR-0007, test strategy). Schemathesis is not
used: it needs Hypothesis (MPL-2.0, outside the allowed licences). Instead every response the backend tests receive
from /api/v1 is checked against the contract — the operation must exist, the status code must be documented and a JSON
body must match its schema (JSON Schema 2020-12, as OpenAPI 3.1) — and test_contract.py compares the operations of the
app with those of the contract. The contract files are read as they are (relative $refs between files are resolved by
the `referencing` registry, so recursive schemas work too).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

API = Path(__file__).resolve().parents[2] / "api"
ROOT = API / "openapi.yaml"
PREFIX = "/api/v1"
METHODS = ("get", "put", "post", "delete", "patch")


@dataclass(frozen=True)
class Operation:
    method: str
    path: str
    operation_id: str | None
    responses: dict[str, Any]
    document: Path  # the file the operation is written in (its $refs are relative to it)
    pointer: str  # JSON pointer of the operation inside that file
    not_implemented: str | None  # x-not-implemented: why the server has no such operation (yet)


@cache
def load(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _uri(path: Path) -> str:
    return path.resolve().as_uri()


def _resolve(base: Path, ref: str) -> tuple[Path, str, Any]:
    target, _, pointer = ref.partition("#")
    document = (base.parent / target).resolve() if target else base
    node = load(document)
    for part in pointer.strip("/").split("/") if pointer.strip("/") else []:
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return document, pointer, node


@cache
def operations() -> tuple[Operation, ...]:
    found = []
    for path, item in load(ROOT)["paths"].items():
        document, pointer, node = (ROOT, "/paths/" + path.replace("~", "~0").replace("/", "~1"), item)
        if "$ref" in item:
            document, pointer, node = _resolve(ROOT, item["$ref"])
        for method in METHODS:
            if method not in node:
                continue
            op = node[method]
            responses = {}
            for status, response in op.get("responses", {}).items():
                responses[str(status)] = response
            found.append(
                Operation(
                    method=method,
                    path=path,
                    operation_id=op.get("operationId"),
                    responses=responses,
                    document=document,
                    pointer=f"{pointer}/{method}",
                    not_implemented=op.get("x-not-implemented"),
                )
            )
    return tuple(found)


@cache
def _registry() -> Registry[Any]:
    resources = [
        (_uri(path), Resource.from_contents(load(path), default_specification=DRAFT202012))
        for path in [
            ROOT,
            *sorted((API / "modules").glob("*.yaml")),
            *sorted((API / "components").glob("*.yaml")),
        ]
    ]
    return Registry().with_resources(resources)


@cache
def _matchers() -> tuple[tuple[re.Pattern[str], str, Operation], ...]:
    out = []
    for op in operations():
        pattern = re.sub(r"\\\{[^}]+\\\}", "[^/]+", re.escape(op.path))
        out.append((re.compile(f"^{pattern}$"), op.method, op))
    # Literal segments win over parameters (/me/sessions/revoke-others before /me/sessions/{id}).
    return tuple(sorted(out, key=lambda m: m[2].path.count("{")))


def find(method: str, path: str) -> Operation | None:
    for pattern, op_method, op in _matchers():
        if op_method == method and pattern.match(path):
            return op
    return None


def _response(op: Operation, status: int) -> tuple[Path, str, Any] | None:
    for key in (str(status), f"{str(status)[0]}XX", "default"):
        if key in op.responses:
            response = op.responses[key]
            pointer = f"{op.pointer}/responses/{key}"
            if "$ref" in response:
                return _resolve(op.document, response["$ref"])
            return op.document, pointer, response
    return None


def problems(method: str, path: str, status: int, content_type: str, body: bytes) -> list[str]:
    """What is wrong with this response by the contract (empty when it conforms)."""
    if not path.startswith(PREFIX + "/"):
        return []
    path = path.removeprefix(PREFIX)
    op = find(method.lower(), path)
    if op is None:
        return [f"{method} {path}: no such operation in the contract"]
    found = _response(op, status)
    if found is None:
        return [f"{op.operation_id} ({method} {path}): status {status} is not documented"]
    document, pointer, response = found
    media = content_type.split(";")[0].strip()
    content = response.get("content") or {}
    if media not in content or not (media == "application/json" or media.endswith("+json")):
        return []
    if not body:
        return [f"{op.operation_id} ({method} {path}) {status}: empty body, {media} expected"]
    if "schema" not in content[media]:
        return []
    escaped = media.replace("~", "~0").replace("/", "~1")
    schema_pointer = f"{pointer}/content/{escaped}/schema"
    instance = json.loads(body)
    validator = Draft202012Validator(
        {"$ref": f"{_uri(document)}#{schema_pointer}"}, registry=_registry(), format_checker=None
    )
    return [
        f"{op.operation_id} ({method} {path}) {status}: {error.json_path}: {error.message[:200]}"
        for error in sorted(validator.iter_errors(instance), key=lambda e: e.json_path)[:5]
    ]
