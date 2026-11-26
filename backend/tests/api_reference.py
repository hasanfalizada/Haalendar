"""The API reference for readers (docs/guide/api.md), written from the contract (api/openapi.yaml) and never by hand.

+++===+++ 2026-11-26 21:40 +04 — Hasan Alizada — HAAL-153 (D-129, option A of the owner). Markdown, so it reads on
GitHub as it is and every change of the contract shows in the diff of the reference too; no new dependency (PyYAML of
the contract tests). test_api_reference.py fails when the file differs from what the contract gives. Rewrite it with
`cd backend && uv run python -m tests.api_reference`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

from tests.contract import API, METHODS, ROOT, load

GUIDE = API.parent / "docs" / "guide" / "api.md"
COMPONENTS = [API / "components" / "common.yaml", *sorted((API / "modules").glob("*.yaml"))]


def _cell(text: object) -> str:
    """One table cell: one line, pipes escaped."""
    return re.sub(r"\s+", " ", str(text)).strip().replace("|", "\\|")


def _anchor(kind: str, name: str) -> str:
    return f"{kind}-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}"


class Reference:
    def __init__(self) -> None:
        self.root: dict[str, Any] = load(ROOT)
        self.named: dict[str, tuple[Path, dict[str, Any]]] = {}
        for document in COMPONENTS:
            for name, schema in (load(document).get("components", {}).get("schemas") or {}).items():
                self.named[name] = (document, schema)

    # --- $ref ---------------------------------------------------------------------------------------------------

    def resolve(self, base: Path, node: Any) -> tuple[Path, Any]:
        """Follows $refs to the node they name; returns it with the file its own $refs are relative to."""
        while isinstance(node, dict) and "$ref" in node:
            target, _, pointer = node["$ref"].partition("#")
            base = (base.parent / target).resolve() if target else base
            node = load(base)
            for part in [p for p in pointer.split("/") if p]:
                node = node[part.replace("~1", "/").replace("~0", "~")]
        return base, node

    def _schema_name(self, ref: str) -> str | None:
        match = re.fullmatch(r"[^#]*#/components/schemas/([^/]+)", ref)
        return match.group(1) if match else None

    # --- schemas ------------------------------------------------------------------------------------------------

    def type_of(self, base: Path, schema: Any) -> str:
        """A short description of a schema's type, with links to named schemas."""
        if not isinstance(schema, dict):
            return ""
        if "$ref" in schema:
            name = self._schema_name(schema["$ref"])
            if name:
                return f"[{name}](#{_anchor('schema', name)})"
            return self.type_of(*self.resolve(base, schema))
        for key in ("oneOf", "anyOf"):
            if key in schema:
                return " or ".join(self.type_of(base, s) for s in schema[key])
        if "allOf" in schema:
            return " and ".join(self.type_of(base, s) for s in schema["allOf"])
        if "const" in schema:
            return f"`{schema['const']}`"
        kind = schema.get("type", "object" if "properties" in schema else "any")
        if isinstance(kind, list):
            kind = " or ".join(kind)
        if kind == "array":
            return f"array of {self.type_of(base, schema.get('items', {}))}"
        text = str(kind)
        if "format" in schema:
            text += f" ({schema['format']})"
        if "enum" in schema:
            text += ": " + ", ".join(f"`{v}`" for v in schema["enum"])
        return text

    def _limits(self, schema: dict[str, Any]) -> str:
        parts = []
        for key, word in (
            ("minLength", "min length"),
            ("maxLength", "max length"),
            ("minimum", "min"),
            ("maximum", "max"),
            ("minItems", "min items"),
            ("maxItems", "max items"),
            ("pattern", "pattern"),
            ("default", "default"),
        ):
            if key in schema:
                value = schema[key]
                shown = "true" if value is True else "false" if value is False else value
                parts.append(f"{word} `{shown}`")
        if schema.get("readOnly"):
            parts.append("read-only")
        if schema.get("writeOnly"):
            parts.append("write-only")
        return ", ".join(parts)

    def _describe(self, schema: dict[str, Any]) -> str:
        return "; ".join(
            p for p in (schema.get("description", "").strip().rstrip("."), self._limits(schema)) if p
        )

    def _inline_object(self, schema: Any) -> bool:
        return (
            isinstance(schema, dict)
            and "$ref" not in schema
            and ("properties" in schema or "allOf" in schema)
        )

    def fields(self, base: Path, schema: Any, prefix: str = "") -> list[tuple[str, str, bool, str]]:
        """Rows (field, type, required, description) of an object schema; inline objects and arrays of them are
        flattened with dotted names, named schemas are linked."""
        rows: list[tuple[str, str, bool, str]] = []
        if not isinstance(schema, dict):
            return rows
        if "allOf" in schema:
            for part in schema["allOf"]:
                part_base, part_schema = self.resolve(base, part)
                rows += self.fields(part_base, part_schema, prefix)
        required = set(schema.get("required", []))
        for name, prop in (schema.get("properties") or {}).items():
            field = f"{prefix}{name}"
            rows.append((field, self.type_of(base, prop), name in required, self._describe(prop)))
            if self._inline_object(prop):
                rows += self.fields(base, prop, f"{field}.")
            elif (
                isinstance(prop, dict)
                and prop.get("type") == "array"
                and self._inline_object(prop.get("items"))
            ):
                rows += self.fields(base, prop["items"], f"{field}[].")
        return rows

    def _field_table(self, rows: list[tuple[str, str, bool, str]]) -> list[str]:
        out = ["| Field | Type | Required | Description |", "|---|---|---|---|"]
        for field, kind, required, text in rows:
            out.append(f"| `{field}` | {_cell(kind)} | {'yes' if required else ''} | {_cell(text)} |")
        return out

    def _body(self, base: Path, schema: Any) -> list[str]:
        """A request or response body: its type, and a field table when it is an object written in place."""
        base, schema = (base, schema)
        if self._inline_object(schema):
            return self._field_table(self.fields(base, schema))
        if (
            isinstance(schema, dict)
            and schema.get("type") == "array"
            and self._inline_object(schema.get("items"))
        ):
            return ["Array of objects:", "", *self._field_table(self.fields(base, schema["items"]))]
        return [f"Type: {self.type_of(base, schema)}"]

    # --- operations ---------------------------------------------------------------------------------------------

    def operations(self) -> list[tuple[str, str, Path, dict[str, Any]]]:
        found = []
        for path, item in self.root["paths"].items():
            base, node = self.resolve(ROOT, item)
            for method in METHODS:
                if method in node:
                    found.append((method, path, base, node[method]))
        return found

    def _parameters(self, base: Path, op: dict[str, Any]) -> list[str]:
        if not op.get("parameters"):
            return []
        out = ["**Parameters**", "", "| Name | In | Type | Required | Description |", "|---|---|---|---|---|"]
        for raw in op["parameters"]:
            p_base, p = self.resolve(base, raw)
            schema = p.get("schema", {})
            text = "; ".join(
                x for x in (p.get("description", "").strip().rstrip("."), self._limits(schema)) if x
            )
            required = "yes" if p.get("required") else ""
            out.append(
                f"| `{p['name']}` | {p['in']} | {_cell(self.type_of(p_base, schema))} | {required} | {_cell(text)} |"
            )
        return [*out, ""]

    def _request(self, base: Path, op: dict[str, Any]) -> list[str]:
        if "requestBody" not in op:
            return []
        r_base, body = self.resolve(base, op["requestBody"])
        out = []
        for media, content in (body.get("content") or {}).items():
            optional = "" if body.get("required") else " (optional)"
            out += [f"**Request body** `{media}`{optional}", ""]
            out += [*self._body(r_base, content.get("schema", {})), ""]
        return out

    def _responses(self, base: Path, op: dict[str, Any]) -> list[str]:
        out = ["**Responses**", "", "| Status | Meaning | Body |", "|---|---|---|"]
        bodies: list[str] = []
        for status, raw in sorted(op.get("responses", {}).items(), key=lambda r: str(r[0])):
            r_base, response = self.resolve(base, raw)
            kinds = []
            for media, content in (response.get("content") or {}).items():
                schema = content.get("schema", {})
                if self._inline_object(schema) or (
                    isinstance(schema, dict)
                    and schema.get("type") == "array"
                    and self._inline_object(schema.get("items"))
                ):
                    kinds.append(f"`{media}`, below")
                    bodies += [f"Body of `{status}`:", "", *self._body(r_base, schema), ""]
                else:
                    kinds.append(f"`{media}` {self.type_of(r_base, schema)}")
            out.append(f"| {status} | {_cell(response.get('description', ''))} | {_cell('; '.join(kinds))} |")
        return [*out, "", *bodies]

    def _operation(self, method: str, path: str, base: Path, op: dict[str, Any]) -> list[str]:
        out = [f"### {method.upper()} {path}", "", f'<a id="{_anchor("op", op["operationId"])}"></a>', ""]
        out += [_cell(op.get("summary", "")), ""]
        notes = []
        if op.get("security") == []:
            notes.append("**Public:** no sign-in needed.")
        if "x-not-implemented" in op:
            notes.append(f"**Not served by the server:** {_cell(op['x-not-implemented'])}")
        if op.get("x-status", "ready") != "ready":
            notes.append(f"**Status:** {_cell(op['x-status'])}")
        if "x-soft-delete" in op:
            notes.append(f"**Soft delete:** {_cell(op['x-soft-delete'])}")
        out += [f"- {n}" for n in notes] + ([""] if notes else [])
        if op.get("description"):
            out += [op["description"].strip(), ""]
        return out + self._parameters(base, op) + self._request(base, op) + self._responses(base, op)

    # --- the document -------------------------------------------------------------------------------------------

    def render(self) -> str:
        info = self.root["info"]
        tags = [(t["name"], t.get("description", "")) for t in self.root.get("tags", [])]
        by_tag: dict[str, list[tuple[str, str, Path, dict[str, Any]]]] = {name: [] for name, _ in tags}
        for operation in self.operations():
            by_tag.setdefault(operation[3]["tags"][0], []).append(operation)
        served = sum(1 for o in self.operations() if "x-not-implemented" not in o[3])
        out = [
            "# Haalendar API reference",
            "",
            "<!-- Generated from api/openapi.yaml by backend/tests/api_reference.py: do not edit by hand. After a change"
            " of the contract, run `cd backend && uv run python -m tests.api_reference`. -->",
            "",
            f"{info['title']} {info['version']}: {info.get('summary', '')} The contract is "
            "[`api/openapi.yaml`](../../api/openapi.yaml) (OpenAPI 3.1); this page is written from it, and a test fails"
            " when the two differ. How to call the API from a script: [api-usage.md](api-usage.md).",
            "",
            f"Base path: `{self.root['servers'][0]['url']}`, on the address of the installation. "
            f"{len(self.operations())} operations, {served} of them served by the server; the others are described"
            " for completeness and say how their data is reached instead (most through offline sync).",
            "",
            "## Conventions",
            "",
            # The contract's own first line points to api/README.md, from the contract's folder.
            re.sub(r"^Conventions \(see api/README.md\):\n", "", info.get("description", "").strip()),
            "",
            "More, with the error codes and the rate limits: [`api/README.md`](../../api/README.md).",
            "",
            "## Authentication",
            "",
            "| Scheme | Where | Name | Description |",
            "|---|---|---|---|",
        ]
        schemes = load(API / "components" / "common.yaml")["components"]["securitySchemes"]
        for name, scheme in schemes.items():
            out.append(
                f"| {name} | {scheme.get('in', scheme['type'])} | `{scheme.get('name', '')}` |"
                f" {_cell(scheme.get('description', ''))} |"
            )
        out += ["", "Operations marked **Public** need neither.", "", "## Operations", ""]
        for name, text in tags:
            if by_tag.get(name):
                out.append(f"- [{name}](#{_anchor('tag', name)}) — {text} ({len(by_tag[name])})")
        out += ["- [Schemas](#schemas)", ""]
        for name, text in tags:
            if not by_tag.get(name):
                continue
            out += [f"## {name}", "", f'<a id="{_anchor("tag", name)}"></a>', "", text, ""]
            for method, path, base, op in by_tag[name]:
                out += self._operation(method, path, base, op)
        out += ["## Schemas", "", "The named types the operations refer to.", ""]
        for name in sorted(self.named):
            base, schema = self.named[name]
            out += [f"### {name}", "", f'<a id="{_anchor("schema", name)}"></a>', ""]
            if schema.get("description"):
                out += [_cell(schema["description"]), ""]
            if self._inline_object(schema):
                out += [*self._field_table(self.fields(base, schema)), ""]
            else:
                limits = self._limits(schema)
                out += [f"Type: {self.type_of(base, schema)}" + (f"; {limits}" if limits else ""), ""]
        return "\n".join(out).rstrip() + "\n"


def render() -> str:
    return Reference().render()


def main() -> int:
    GUIDE.parent.mkdir(parents=True, exist_ok=True)
    GUIDE.write_text(render(), encoding="utf-8")
    print(f"wrote {GUIDE.relative_to(API.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
