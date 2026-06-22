# PyramydalV2 Guide

Single reference for architecture, local development, production deployment, and day-to-day operations.

---

## What this is

Internal AWS platform replacing Excel for production data (~75k rows):

- PostgreSQL as system of record
- S3 for uploads/exports (versioned)
- Lambda for XLSX imports and scheduled recalculation (every 15 minutes)
- FastAPI backend (one codebase for prod and localstack)
- React/Vite in-house UI

**Problem solved:** slow Excel loads, fragile cross-file formulas, no audit trail.

---

## Architecture

```
User (UI) → FastAPI backend → PostgreSQL
                ↓                    ↑
              S3 uploads      Lambda (import + recalc)
```

| Component | Role |
|-----------|------|
| **RDS PostgreSQL** | `main_rows`, reference tables, staging, audit |
| **S3** | `uploads/*` for reference XLSX, `exports/*` for exports |
| **Lambda import** | Staging → validate → atomic swap → `imports_audit` |
| **Lambda recalc** | EventBridge `rate(15 minutes)` → `recalc_derived_columns()` |
| **Backend (FastAPI)** | API for UI; shared prod/localstack implementation |
| **UI (React/Vite)** | Paginated table, inline edit, import/recalc status |
| **Terraform** | RDS, S3, Lambda, VPC, IAM |
| **GitHub Actions** | Terraform plan/apply, Lambda deploy |

**Data flow**

1. User edits rows or uploads reference files via UI.
2. Uploads land in S3; import Lambda loads staging, validates, swaps to live tables.
3. Recalc Lambda joins reference data and overwrites **derived** columns only.
4. Audit tables record imports, recalc runs, and user edits.

**Security:** RDS in private subnets; Lambda in VPC; encryption at rest; CloudWatch + DB audit.

---

## Repository layout

```text
pyramydalV2/
├── backend/            # FastAPI API
├── ui/                 # React/Vite web app
├── lambda/             # import_reference, recalc
├── db/
│   ├── alembic/        # Alembic migrations (source of truth)
│   ├── schema/         # Reference SQL used by initial migration
│   └── seed/           # Local test seed SQL
├── infra/terraform/    # modules + environments/prod
├── scripts/            # bootstrap, build-lambda-packages, initial_load
├── docs/               # This guide + deep-dive references
├── docker-compose.local.yml
└── xls/                # Sample XLSX (not committed; add locally)
```

---

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| Docker | current | Local Postgres (and optional Localstack stack) |
| Python | 3.11+ | Backend, scripts, Lambda packaging |
| Node.js | 20+ | UI |
| npm | current | UI |
| ripgrep (`rg`) | current | Bootstrap script |
| AWS CLI + Terraform | ≥ 1.5 | Production deploy only |
| `psql` | any | Production DB init |

---

## Local development

### Recommended: bootstrap script

Starts Postgres in Docker, applies schema, optionally seeds from XLSX, runs backend + UI.

```bash
cd pyramydalV2
cp .env.example .env          # optional; script creates .env if missing
chmod +x scripts/bootstrap-test-app.sh
./scripts/bootstrap-test-app.sh
```

| Service | URL |
|---------|-----|
| UI | http://localhost:5173 |
| Backend | http://localhost:8001 |
| Postgres | localhost:5433 (user/pass/db: `admin`/`admin`/`production`) |

**Seeding:** Script defaults to loading from `xls/*.xlsx`. To skip, add `SEED_FROM_XLSX=0` to `.env`. To pick a file: `XLSX_PATH=xls/yourfile.xlsx`.

**Verify:**

```bash
curl http://localhost:8001/health
```

Ctrl+C stops backend and UI. Postgres container keeps running.

### Manual: Docker backend stack

Full compose (Postgres + Localstack + backend in containers):

```bash
docker compose -f docker-compose.local.yml up -d
```

Apply migrations (first time or after pull):

```bash
./scripts/db-migrate.sh
```

Run UI separately:

```bash
cd ui && cp .env.localstack .env.local && npm install && npm run dev
```

### Localstack integration test

Automated smoke test (migrations include smoke seed + API checks):

```bash
./scripts/test-localstack-integration.sh
```

### Environment variables

Root `.env` (backend):

| Variable | Local default | Notes |
|----------|---------------|-------|
| `DB_HOST` | `localhost` | `postgres` inside Docker compose |
| `DB_PORT` | `5433` | Host-mapped port |
| `DB_NAME` | `production` | |
| `DB_USER` / `DB_PASSWORD` | `admin` / `admin` | |
| `AWS_REGION` | `eu-central-1` | |
| `AWS_ENDPOINT_URL` | empty | Set to `http://localstack:4566` for Localstack |
| `RECALC_LAMBDA_NAME` | `pyramydal-prod-recalc` | |
| `SEED_FROM_XLSX` | `1` | Set `0` to skip XLSX seed on bootstrap |
| `XLSX_PATH` | — | Optional explicit path to seed file |

UI (`ui/.env.local`):

| Variable | Purpose |
|----------|---------|
| `VITE_API_MODE` | `aws`, `localstack`, or `mock` |
| `VITE_API_BASE_URL_AWS` | Backend URL (default `http://localhost:8001`) |
| `VITE_API_BASE_URL_LOCALSTACK` | Same for localstack profile |

---

## Production deployment

### 1. Clone and configure secrets

```bash
git clone <repo-url> && cd pyramydalV2
export DB_PASSWORD=$(openssl rand -base64 20)
```

### 2. Terraform state bucket

```bash
aws s3 mb s3://pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text) --region eu-central-1
aws s3api put-bucket-versioning \
  --bucket pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text) \
  --versioning-configuration Status=Enabled
```

### 3. Terraform variables and apply

```bash
cd infra/terraform/environments/prod
cp terraform.tfvars.example terraform.tfvars
# Edit: db_password, db_username, environment

terraform init \
  -backend-config="bucket=pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text)" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=eu-central-1"

terraform plan && terraform apply
```

### 4. Run database migrations

```bash
RDS_ENDPOINT=$(terraform output -raw rds_address)
cd ../../../../
export DB_HOST="$RDS_ENDPOINT" DB_PORT=5432 DB_NAME=production DB_USER=admin DB_PASSWORD="$DB_PASSWORD"
./scripts/db-migrate.sh
```

Legacy DBs already initialized with manual `db/schema/*.sql` apply: `./scripts/db-migrate.sh` stamps head automatically, or run `alembic stamp head` manually.

### 5. Deploy Lambda packages

```bash
chmod +x scripts/build-lambda-packages.sh
./scripts/build-lambda-packages.sh
cd infra/terraform/environments/prod && terraform apply -auto-approve
```

### 6. Load initial data

```bash
pip3 install psycopg2-binary openpyxl
python3 scripts/initial_load.py \
  --excel xls/normare_utilaje_2024.xlsx \
  --sheet "PAGINA PRINCIPALA" \
  --db-host "$RDS_ENDPOINT" \
  --db-user admin \
  --db-password "$DB_PASSWORD"
```

### 7. Verify recalculation

```bash
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "admin"}' \
  /tmp/recalc-result.json
```

---

## Day-to-day operations

### Morning checks

```bash
aws logs tail /aws/lambda/pyramydal-prod-recalc --since 1h
aws logs tail /aws/lambda/pyramydal-prod-import --since 1h
```

```sql
SELECT import_type, status, rows_loaded, started_at
FROM app.v_recent_imports LIMIT 10;

SELECT status, rows_updated, rows_unmatched, execution_time_ms, started_at
FROM app.recalc_runs ORDER BY started_at DESC LIMIT 20;
```

### Manual recalc

```bash
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "operator@example.com"}' \
  /tmp/recalc-result.json
```

### Upload reference file and import

```bash
aws s3 cp xls/Lista\ programe.xlsx s3://pyramydal-prod-files/uploads/lista_programe/

aws lambda invoke \
  --function-name pyramydal-prod-import \
  --payload '{
    "s3_key": "uploads/lista_programe/Lista programe.xlsx",
    "import_type": "lista_programe",
    "uploaded_by": "operator@example.com"
  }' \
  /tmp/import-result.json
```

### Export main rows

```bash
psql -h <rds-endpoint> -U admin -d production -c \
  "COPY (SELECT * FROM app.main_rows WHERE deleted_at IS NULL) TO STDOUT WITH CSV HEADER" \
  > main_rows_export_$(date +%Y%m%d).csv
```

### Troubleshooting

| Symptom | Action |
|---------|--------|
| Lambda failure | CloudWatch logs → VPC/DB connectivity → S3 key exists |
| Slow recalc | Check `recalc_runs.execution_time_ms`; run `VACUUM ANALYZE` |
| Unmatched rows | `SELECT * FROM app.v_unmatched_main_rows LIMIT 50;` → import missing reference data |
| Local DB down | `docker compose -f docker-compose.local.yml logs postgres --tail 100` |

### Maintenance

- **Weekly:** `VACUUM ANALYZE` on high-churn tables; review import/recalc success rates
- **Monthly:** IAM/secrets review; RDS restore drill; cost review

---

## Core concepts

### Editable vs derived columns

- **User-editable:** inputs like `buc`, `reper`, `client` — never overwritten by recalc
- **Derived:** computed from reference joins and formulas — always overwritten on recalc

Recalc runs every 15 minutes via EventBridge → Lambda → `app.recalc_derived_columns()`.

### Import pipeline

Staging → validate → atomic swap. Every attempt logged in `imports_audit`. Same file can be re-run safely.

### Key tables

| Table | Purpose |
|-------|---------|
| `app.main_rows` | Primary production dataset |
| `app.lista_programe`, `app.price_list` | Reference data |
| `app.imports_audit` | Import history |
| `app.recalc_runs` | Recalc history |
| `app.user_edits` | Row edit audit |

---

## Database migrations

Schema changes use **Alembic**. Migrations live in `db/alembic/versions/`.

| Revision | Purpose |
|----------|---------|
| `0001` | Initial schema (from `db/schema/*.sql`) |
| `0002` | Smoke-test seed when `main_rows` is empty |

Do **not** edit `db/schema/*.sql` for new changes — add a new revision instead.

```bash
./scripts/db-migrate.sh              # apply pending migrations
.venv/bin/python -m alembic revision -m "add_foo"
.venv/bin/python -m alembic current
.venv/bin/python -m alembic history
```

Production / XLSX-loaded databases skip `0002` inserts automatically. Real data loads use `scripts/initial_load.py`.

See [db/README.md](../db/README.md) for details.

---

## Deep-dive references

Use these for schema details, SQL, and implementation specifics:

| Document | Contents |
|----------|----------|
| [data-model.md](data-model.md) | Full schema, columns, indexes |
| [import-flow.md](import-flow.md) | Import pipeline step-by-step |
| [recalc-logic.md](recalc-logic.md) | Derived column formulas and SQL |
| [mvp-plan.md](mvp-plan.md) | Milestone timeline and acceptance criteria |
| [login-auth-plan.md](login-auth-plan.md) | Future auth design |
| [full-columns-test-matrix.md](full-columns-test-matrix.md) | Column test coverage matrix |

---

## Roadmap notes

- UI milestone: paginated main rows, inline edit/save, recalc status (in progress)
- Auth not yet wired — see `login-auth-plan.md`
- SQS for async import/recalc buffering is under evaluation — define message contract before adding
- Appsmith removed; all UI is in-house (`ui/`)

For session-specific handoff context, see [vacation-handoff-prompt.md](vacation-handoff-prompt.md).
