#!/usr/bin/env python3
"""Apply Alembic migrations (upgrade head).

If the database already has schema from manual db/schema/*.sql applies but no
alembic_version row, stamps revision 0001 then upgrades to head (applies 0002
seed only when main_rows is empty).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import psycopg2
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.config import settings  # noqa: E402

INITIAL_REVISION = "0001"


def _connect():
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        connect_timeout=10,
    )


def _schema_exists(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('app.main_rows')")
        return cur.fetchone()[0] is not None


def _alembic_version(conn) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'alembic_version'
            )
            """
        )
        if not cur.fetchone()[0]:
            return None
        cur.execute("SELECT version_num FROM alembic_version LIMIT 1")
        row = cur.fetchone()
        return row[0] if row else None


def _alembic_config() -> Config:
    return Config(str(ROOT / "alembic.ini"))


def migrate(revision: str = "head") -> None:
    cfg = _alembic_config()
    conn = _connect()
    try:
        version = _alembic_version(conn)
        if version is None and _schema_exists(conn) and revision in {"head", INITIAL_REVISION}:
            print(
                "Legacy schema detected (app.main_rows exists, alembic_version missing). "
                "Stamping 0001 and applying pending revisions.",
                flush=True,
            )
            command.stamp(cfg, INITIAL_REVISION)
            command.upgrade(cfg, revision)
            return
    finally:
        conn.close()

    command.upgrade(cfg, revision)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Alembic database migrations.")
    parser.add_argument(
        "revision",
        nargs="?",
        default="head",
        help="Target revision (default: head)",
    )
    args = parser.parse_args()
    migrate(args.revision)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
