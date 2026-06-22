# Database

Schema changes are managed with [Alembic](https://alembic.sqlalchemy.org/).

## Apply migrations

From repo root (uses `.env` DB settings):

```bash
./scripts/db-migrate.sh
# or
python scripts/db_migrate.py
```

## Create a new migration

```bash
alembic revision -m "describe_change"
# edit db/alembic/versions/<rev>_describe_change.py
alembic upgrade head
```

Use `op.execute(...)` or SQLAlchemy `op` helpers. For stored procedures/views, raw SQL via `op.get_bind().exec_driver_sql(...)` is fine.

## Legacy databases

If schema was applied manually from `db/schema/*.sql` before Alembic:

```bash
alembic stamp head
```

`scripts/db_migrate.py` does this automatically when it detects `app.main_rows` without `alembic_version`.

## Reference SQL

- `db/schema/` — baseline for revision `0001` only. See [schema/README.md](schema/README.md).
- `db/seed/` — smoke-test rows for revision `0002`. See [seed/README.md](seed/README.md).

New schema or seed changes belong in new Alembic revisions under `db/alembic/versions/`.

Production data loads use `scripts/initial_load.py`, not Alembic.
