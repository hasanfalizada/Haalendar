"""Licence gate: every dependency (Python and npm, runtime and tooling) under a licence the policy allows.

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. Policy and exceptions: backend/licence-policy.json (owner decisions of
2026-11-01, docs/security/security-baseline.md §7). A licence expression is accepted when it is allowed as a whole
(`A OR B`: one of them, `A AND B`: both); anything else needs an exception for that package, and an exception for a
package that must not ship (`"shipped": false`) fails once the package reaches the app (Python runtime dependencies,
the web app's production dependencies). Exceptions nothing matches any more fail too, so the list stays true.
Run from backend/ with its environment (it reads the installed Python packages): `pnpm security:licences`.
Exit code 0 only when everything is allowed.
"""

from __future__ import annotations

import fnmatch
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from importlib.metadata import distributions
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "backend" / "licence-policy.json"
NPM_PROJECTS = ("frontend", "e2e")  # the workspace root has no dependencies of its own
SHIPPED_NPM = "frontend"  # its production dependencies are the browser bundle
OWN_PACKAGES = {"haalendar-backend"}

# Trove classifiers of packages without an SPDX License-Expression.
CLASSIFIERS = {
    "MIT License": "MIT",
    "Apache Software License": "Apache-2.0",
    "BSD License": "BSD",
    "ISC License (ISCL)": "ISC",
    "Python Software Foundation License": "PSF-2.0",
    "The Unlicense (Unlicense)": "Unlicense",
    "Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "GNU Lesser General Public License v3 (LGPLv3)": "LGPL-3.0-only",
    "GNU Lesser General Public License v3 or later (LGPLv3+)": "LGPL-3.0-or-later",
    "GNU General Public License v3 (GPLv3)": "GPL-3.0-only",
    "Public Domain": "Public-Domain",
}


@dataclass(frozen=True)
class Package:
    ecosystem: str  # "python" | "npm"
    name: str
    version: str
    licence: str  # SPDX expression, or "UNKNOWN"
    shipped: bool  # reaches the running app (server or browser)


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def allowed(expression: str, permitted: set[str]) -> bool:
    """Evaluates an SPDX expression (AND, OR, WITH, parentheses) against the permitted identifiers."""
    tokens = re.findall(r"\(|\)|[^\s()]+", expression)
    if not tokens:
        return False
    position = 0

    def term() -> bool:
        nonlocal position
        word = tokens[position]
        position += 1
        if word == "(":
            value = either()
            position += 1  # ")"
        else:
            value = word in permitted
        if position < len(tokens) and tokens[position] == "WITH":
            position += 2  # an exception only widens a licence; the base licence decides
        return value

    def both() -> bool:
        nonlocal position
        value = term()
        while position < len(tokens) and tokens[position] == "AND":
            position += 1
            value = term() and value
        return value

    def either() -> bool:
        nonlocal position
        value = both()
        while position < len(tokens) and tokens[position] == "OR":
            position += 1
            value = both() or value
        return value

    try:
        return either() and position == len(tokens)
    except IndexError:
        return False


# SPDX identifiers outside the policy, so that the free-text License field is read as SPDX only when it is one.
COPYLEFT = {
    "GPL-2.0-only",
    "GPL-3.0-only",
    "AGPL-3.0-only",
    "LGPL-2.1-only",
    "LGPL-3.0-only",
    "MPL-2.0",
    "EPL-2.0",
}


def python_licence(metadata: Any, known: set[str]) -> str:
    """License-Expression; else the License field when it is an SPDX expression; else the licence classifiers."""
    expression = metadata.get("License-Expression")
    if expression:
        return str(expression)
    field = (metadata.get("License") or "").strip()
    words = [w for w in re.findall(r"[^\s()]+", field) if w not in ("AND", "OR", "WITH")]
    if field and "\n" not in field and words and all(w in known for w in words):
        return field
    named = [
        CLASSIFIERS.get(c.split("::")[-1].strip(), "UNKNOWN")
        for c in metadata.get_all("Classifier") or []
        if c.startswith("License ::") and c.split("::")[-1].strip() != "OSI Approved"
    ]
    # Several licence classifiers list the licences a package may be used under (dual licensing).
    return " OR ".join(named) if named else "UNKNOWN"


def python_packages(runtime: set[str], known: set[str]) -> list[Package]:
    found = {}
    for dist in distributions():
        name = normalize(dist.metadata["Name"])
        if name in OWN_PACKAGES:
            continue
        found[name] = Package(
            "python", name, dist.version, python_licence(dist.metadata, known), name in runtime
        )
    return sorted(found.values(), key=lambda p: p.name)


def python_runtime() -> set[str]:
    command = [
        "uv",
        "export",
        "--no-dev",
        "--no-emit-project",
        "--no-hashes",
        "--format",
        "requirements-txt",
        "-q",
    ]
    out = subprocess.run(  # noqa: S603 — fixed commands of the developer's own tools, no outside input
        command,
        cwd=ROOT / "backend",
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return {
        normalize(re.split(r"[=<>\[;\s]", line, maxsplit=1)[0])
        for line in out.splitlines()
        if line[:1].isalnum()
    }


def _pnpm_licences(project: str, prod: bool) -> dict[str, list[dict[str, Any]]]:
    command = ["pnpm", "licenses", "list", "--json", *(["--prod"] if prod else [])]
    out = subprocess.run(command, cwd=ROOT / project, check=True, capture_output=True, text=True).stdout  # noqa: S603
    result: dict[str, list[dict[str, Any]]] = json.loads(out or "{}")
    return result


def npm_packages() -> list[Package]:
    shipped = {
        (entry["name"], version)
        for entries in _pnpm_licences(SHIPPED_NPM, prod=True).values()
        for entry in entries
        for version in entry["versions"]
    }
    found = {}
    for project in NPM_PROJECTS:
        for licence, entries in _pnpm_licences(project, prod=False).items():
            for entry in entries:
                for version in entry["versions"]:
                    key = (entry["name"], version)
                    found[key] = Package("npm", entry["name"], version, licence or "UNKNOWN", key in shipped)
    return sorted(found.values(), key=lambda p: (p.name, p.version))


def check(packages: list[Package], policy: dict[str, Any]) -> list[str]:
    """The problems: packages outside the policy, exceptions that ship although they must not, unused exceptions."""
    permitted = set(policy["allowed"])
    exceptions: list[dict[str, Any]] = policy["exceptions"]
    used: set[int] = set()
    problems = []
    for package in packages:
        if allowed(package.licence, permitted):
            continue
        matches = [
            index
            for index, e in enumerate(exceptions)
            if e["ecosystem"] == package.ecosystem
            and fnmatch.fnmatchcase(package.name, e["package"])
            and e["licence"] == package.licence
        ]
        if not matches:
            problems.append(
                f"{package.ecosystem} {package.name}@{package.version}: {package.licence} is not allowed"
            )
            continue
        used.update(matches)
        if package.shipped and not all(exceptions[i]["shipped"] for i in matches):
            problems.append(
                f"{package.ecosystem} {package.name}@{package.version}: {package.licence} is allowed only in tooling, "
                "but the package now ships with the app"
            )
    for index, e in enumerate(exceptions):
        if index not in used:
            problems.append(f"exception no longer needed: {e['ecosystem']} {e['package']} ({e['licence']})")
    return problems


def main() -> int:
    policy = json.loads(POLICY.read_text(encoding="utf-8"))
    known = set(policy["allowed"]) | {e["licence"] for e in policy["exceptions"]} | COPYLEFT
    packages = python_packages(python_runtime(), known) + npm_packages()
    problems = check(packages, policy)
    for problem in problems:
        print(problem)
    excepted = sum(1 for p in packages if not allowed(p.licence, set(policy["allowed"])))
    print(f"{len(packages)} packages checked, {excepted} under a listed exception, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
