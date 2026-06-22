# Seed data

Smoke-test rows for empty databases. Applied by Alembic revision `0002`.

- **Production / XLSX-loaded DB:** migration `0002` skips inserts when `main_rows` is non-empty.
- **Fresh local / CI:** `0002` inserts minimal reference + main rows for API smoke tests.

Do not apply this file with raw `psql`. Use:

```bash
./scripts/db-migrate.sh
```

Real dataset loads use `scripts/initial_load.py` (bootstrap), not Alembic.
