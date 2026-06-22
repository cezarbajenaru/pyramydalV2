# PyramydalV2 - Excel Replacement Platform

Internal AWS platform for production data management (75k+ rows), automated recalculation, and project-owned UI.

## Problem

- Excel workflow is slow at scale
- Manual cross-file formulas are error-prone
- No centralized audit trail or automation controls

## Stack

- **Database:** RDS PostgreSQL
- **Storage:** S3 (uploads/exports, versioned)
- **Compute:** Lambda (imports + recalc every 15 min)
- **Backend:** FastAPI (prod + localstack)
- **UI:** React/Vite in-house app
- **Infra:** Terraform + GitHub Actions

## Start here

**[docs/GUIDE.md](docs/GUIDE.md)** — local dev, production deploy, operations, architecture.

Quick local start:

```bash
cp .env.example .env
./scripts/bootstrap-test-app.sh
```

→ UI http://localhost:5173 · Backend http://localhost:8001

## Deep dives

| Doc | Topic |
|-----|-------|
| [db/README.md](db/README.md) | Alembic migrations |
| [data-model.md](docs/data-model.md) | Schema and columns |
| [import-flow.md](docs/import-flow.md) | XLSX import pipeline |
| [recalc-logic.md](docs/recalc-logic.md) | Derived column logic |
| [mvp-plan.md](docs/mvp-plan.md) | Milestones and timeline |
