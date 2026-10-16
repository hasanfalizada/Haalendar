"""Soft delete everywhere (FR-X-01, CRITICAL): no delete constructs in the code, every DELETE in the contract is soft,
every table refuses DELETE/TRUNCATE for every role, the ORM/SQL guards refuse deletes before the database, and the
soft-delete helpers mark and restore whole batches (marker `db` where a database is needed).

+++===+++ 2026-10-16 — Hasan Alizada — HAAL-030.
"""

from __future__ import annotations

import ast
import asyncio
import re
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

import psycopg
import pytest
from psycopg import errors
from sqlalchemy import delete, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from haalendar.planning.models import Calendar
from haalendar.security.no_delete import EXEMPT_TABLES
from haalendar.softdelete import PhysicalDeleteError, live, restore_batch, soft_delete

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
MARKER = "physical-delete-allowed:"
SQL_DELETE = re.compile(r"\bdelete\s+from\b|^\s*truncate\s+(table\s+)?[\w\"]", re.IGNORECASE | re.MULTILINE)
FILE_REMOVERS = {"unlink", "rmtree", "remove", "rmdir", "removedirs"}


def _docstring_nodes(tree: ast.AST) -> set[int]:
    nodes: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                nodes.add(id(first.value))
    return nodes


def _violations(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    lines = source.splitlines()
    tree = ast.parse(source)
    docstrings = _docstring_nodes(tree)
    decorators = {
        id(d)
        for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        for d in n.decorator_list
    }
    found: list[tuple[ast.stmt | ast.expr, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("sqlalchemy"):
            found += [(node, "imports sqlalchemy delete") for a in node.names if a.name == "delete"]
        elif (
            isinstance(node, ast.Call) and id(node) not in decorators and isinstance(node.func, ast.Attribute)
        ):
            if node.func.attr == "delete":
                found.append((node, "calls .delete()"))  # session.delete / query.delete
            elif node.func.attr in FILE_REMOVERS:
                found.append((node, f"removes files ({node.func.attr})"))
        elif (
            isinstance(node, ast.Constant)
            and isinstance(node.value, str)
            and id(node) not in docstrings
            and SQL_DELETE.search(node.value)
        ):
            found.append((node, "SQL that deletes rows"))
    rel = path.relative_to(REPO)
    problems: list[str] = []
    for node, why in found:
        end = node.end_lineno or node.lineno
        if not any(MARKER in line for line in lines[node.lineno - 1 : end]):  # the formatter may wrap a call
            problems.append(f"{rel}:{node.lineno}: {why}")
    return problems


def test_source_contains_no_physical_delete() -> None:
    files = sorted((BACKEND / "src").rglob("*.py")) + sorted((BACKEND / "migrations").rglob("*.py"))
    assert len(files) > 20
    problems = [v for f in files for v in _violations(f)]
    assert problems == [], "physical deletes found (soft delete only):\n" + "\n".join(problems)


def test_scanner_catches_delete_constructs(tmp_path: Path) -> None:
    sample = tmp_path / "bad.py"
    sample.write_text(
        "from sqlalchemy import delete\n"
        "async def f(db, obj, p):\n"
        "    await db.delete(obj)\n"
        "    await db.execute(text('DELETE FROM calendar'))\n"
        "    p.unlink()\n"
        "@router.delete('/x')\n"
        "async def g():\n"
        "    '''DELETE FROM in a docstring is fine.'''\n"
        "    p.unlink()  # physical-delete-allowed: test\n",
        encoding="utf-8",
    )
    sample.relative_to(tmp_path)
    reasons = [v.split(": ", 1)[1] for v in _violations_rel(sample, tmp_path)]
    assert reasons == [
        "imports sqlalchemy delete",
        "calls .delete()",
        "SQL that deletes rows",
        "removes files (unlink)",
    ]


def _violations_rel(path: Path, root: Path) -> list[str]:
    global REPO
    saved, REPO = REPO, root
    try:
        return sorted(_violations(path), key=lambda v: int(v.split(":")[1]))
    finally:
        REPO = saved


def test_every_contract_delete_is_soft() -> None:
    missing: list[str] = []
    for module in sorted((REPO / "api" / "modules").glob("*.yaml")):
        lines = module.read_text(encoding="utf-8").splitlines()
        for index, line in enumerate(lines):
            if line.rstrip() != "    delete:":
                continue
            block: list[str] = []
            for following in lines[index + 1 :]:
                if following.strip() and len(following) - len(following.lstrip()) <= 4:
                    break
                block.append(following)
            if not any(b.strip().startswith("x-soft-delete:") for b in block):
                missing.append(f"{module.name}:{index + 1}")
    assert missing == [], f"DELETE operations without x-soft-delete: {missing}"


# ---------- database ----------


def _dsn(url: str) -> str:
    return make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)


@pytest.mark.db
def test_every_table_has_no_delete_triggers(owner_db_url: str) -> None:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        tables = {r[0] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
        triggers = conn.execute(
            "SELECT event_object_table, event_manipulation FROM information_schema.triggers "
            "WHERE trigger_schema = 'public' AND action_statement LIKE '%haalendar_forbid_delete%'"
        ).fetchall()
        truncate = {
            r[0]
            for r in conn.execute(
                "SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid "
                "WHERE t.tgname = 'haalendar_no_truncate' AND NOT t.tgisinternal"
            )
        }
    protected_delete = {table for table, op in triggers if op == "DELETE"}
    expected = tables - EXEMPT_TABLES
    assert expected <= protected_delete, expected - protected_delete
    assert expected <= truncate, expected - truncate


@pytest.mark.db
def test_even_the_owner_cannot_delete_or_truncate(clean_db: str, owner_db_url: str) -> None:
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        with pytest.raises(errors.RestrictViolation, match="soft delete only"):
            conn.execute("DELETE FROM calendar WHERE false")
        with pytest.raises(errors.RestrictViolation):
            conn.execute("TRUNCATE share")  # physical-delete-allowed: proves the trigger refuses it


def _run[T](db_url: str, work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    async def main() -> T:
        engine = create_async_engine(db_url)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await work(db)
        finally:
            await engine.dispose()

    return asyncio.run(main())


async def _with_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(select(func.set_config("app.user_id", str(user_id), False)))


def _owner(clean_db: str, owner_db_url: str) -> uuid.UUID:
    user_id = uuid.uuid7()
    with psycopg.connect(_dsn(owner_db_url), autocommit=True) as conn:
        conn.execute(
            "INSERT INTO user_account (id, email, password_hash, display_name, time_zone) "
            "VALUES (%s, 'del@example.org', 'x', 'Del', 'UTC')",
            (user_id,),
        )
    return user_id


@pytest.mark.db
def test_guards_refuse_deletes_before_the_database(clean_db: str, owner_db_url: str) -> None:
    owner = _owner(clean_db, owner_db_url)

    async def work(db: AsyncSession) -> list[str]:
        await _with_user(db, owner)
        calendar = Calendar(owner_id=owner, name="Gone?")
        db.add(calendar)
        await db.flush()
        refused: list[str] = []
        attempts: dict[str, Callable[[], Awaitable[object]]] = {
            "orm": lambda: db.delete(calendar),
            "statement": lambda: db.execute(delete(Calendar)),  # physical-delete-allowed: proves the guard
            "text": lambda: db.execute(
                text("DELETE FROM calendar")
            ),  # physical-delete-allowed: proves the guard
            "truncate": lambda: db.execute(
                text("TRUNCATE calendar")
            ),  # physical-delete-allowed: proves the guard
        }
        for name, attempt in attempts.items():
            try:
                await attempt()
                await db.flush()
            except PhysicalDeleteError:
                refused.append(name)
            if calendar in db.deleted:
                db.expunge(calendar)
                db.add(calendar)
        await db.rollback()
        return refused

    assert _run(clean_db, work) == ["orm", "statement", "text", "truncate"]


@pytest.mark.db
def test_soft_delete_and_batch_restore(clean_db: str, owner_db_url: str) -> None:
    owner = _owner(clean_db, owner_db_url)

    async def work(db: AsyncSession) -> tuple[int, int, int, int]:
        await _with_user(db, owner)
        together = [Calendar(owner_id=owner, name=f"Batch {i}") for i in range(2)]
        earlier = Calendar(owner_id=owner, name="Deleted earlier")
        db.add_all([*together, earlier])
        await db.flush()
        soft_delete(earlier, owner)
        batch = soft_delete(together[0], owner)
        assert soft_delete(together[1], owner, batch) == batch
        assert soft_delete(together[1], owner) == batch  # idempotent: keeps the original batch
        await db.flush()
        alive = await db.scalar(select(func.count()).select_from(Calendar).where(live(Calendar.deleted_at)))
        stored = await db.scalar(select(func.count()).select_from(Calendar))
        restored = await restore_batch(db, [Calendar], batch, owner)
        after = await db.scalar(select(func.count()).select_from(Calendar).where(live(Calendar.deleted_at)))
        await db.commit()
        return alive or 0, stored or 0, restored, after or 0

    assert _run(clean_db, work) == (0, 3, 2, 2)  # all rows kept; only the batch comes back
