"""Smoke-test seed data for empty databases.

Revision ID: 0002
Revises: 0001
Create Date: 2025-06-22

Inserts minimal rows for localstack/API smoke tests. Skipped when main_rows
already contains data (production or XLSX-seeded local DB).
"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_FILE = "001_localstack_smoke_seed.sql"


def _seed_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "seed"


def _dbapi_cursor():
    return op.get_bind().connection.dbapi_connection.cursor()


def upgrade() -> None:
    with _dbapi_cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM app.main_rows")
        if cur.fetchone()[0] > 0:
            return
        sql = (_seed_dir() / SEED_FILE).read_text(encoding="utf-8")
        cur.execute(sql)


def downgrade() -> None:
    with _dbapi_cursor() as cur:
        cur.execute("DELETE FROM app.main_rows WHERE created_by = 'seed'")
        cur.execute("DELETE FROM app.lista_programe WHERE programator = 'seed-user'")
        cur.execute(
            "DELETE FROM app.price_list WHERE reper IN ('REP-0001', 'REP-0002') "
            "AND client IN ('CLIENT-1', 'CLIENT-2')"
        )
