"""Throw-away stack scripts (scripts/dev): the port check of stack-up.sh and removing containers with their volumes.

+++===+++ 2026-11-01 — Hasan Alizada — HAAL-145. Another project's dev server on port 8081 answered the stack's API
requests and the end-to-end run failed far from the cause; the stack now refuses to start on a taken port. The
throw-away databases were removed without their anonymous volumes: 266 of them (15 GB) piled up on /data.
"""

from __future__ import annotations

import re
import socket
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest

DEV = Path(__file__).resolve().parents[2] / "scripts" / "dev"
SCRIPT = DEV / "ports-free.sh"


@pytest.fixture
def busy_port() -> Iterator[int]:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        yield sock.getsockname()[1]


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
    return port


def _run(*ports: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 — a script of this repository with numbers
        [str(SCRIPT), *map(str, ports)], capture_output=True, text=True, check=False
    )


def test_free_ports_pass() -> None:
    result = _run(_free_port(), _free_port())
    assert result.returncode == 0, result.stdout
    assert result.stdout == ""


def test_a_taken_port_is_named_and_refused(busy_port: int) -> None:
    free = _free_port()
    result = _run(free, busy_port)
    assert result.returncode == 1
    assert f"port {busy_port} is in use" in result.stdout
    assert f"port {free} " not in result.stdout


def test_containers_are_removed_with_their_volumes() -> None:
    removals = [
        (path.name, line.strip())
        for path in sorted(DEV.glob("*.sh"))
        for line in path.read_text().splitlines()
        if re.search(r"\bdocker rm\b", line) and not line.lstrip().startswith("#")
    ]
    assert removals
    assert [r for r in removals if not re.search(r"\s-(?:v|fv|vf)\b", r[1])] == []
