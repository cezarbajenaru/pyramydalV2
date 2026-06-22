"""Initial schema from legacy db/schema SQL files.

Revision ID: 0001
Revises:
Create Date: 2025-06-22

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA_FILES = (
    "001_init.sql",
    "002_staging_and_audit.sql",
    "003_recalc_procedures.sql",
)


def _schema_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "schema"


def _run_sql_file(filename: str) -> None:
    sql = (_schema_dir() / filename).read_text(encoding="utf-8")
    dbapi_conn = op.get_bind().connection.dbapi_connection
    with dbapi_conn.cursor() as cur:
        cur.execute(sql)


def upgrade() -> None:
    for filename in SCHEMA_FILES:
        _run_sql_file(filename)


def downgrade() -> None:
    dbapi_conn = op.get_bind().connection.dbapi_connection
    with dbapi_conn.cursor() as cur:
        cur.execute("DROP SCHEMA IF EXISTS app CASCADE")
