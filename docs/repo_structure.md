# Repository structure

> **Consolidated guide:** [GUIDE.md](GUIDE.md#repository-layout).

```text
pyramydalV2/
├── README.md
├── docs/GUIDE.md          # Single entry point (start here)
├── backend/               # FastAPI API
├── ui/                    # React/Vite web app
├── lambda/
│   ├── import_reference/
│   └── recalc/
├── db/
├── db/
│   ├── alembic/           # Alembic migrations
│   ├── schema/            # Reference SQL (initial migration source)
│   └── seed/
├── infra/terraform/
│   ├── modules/           # rds, s3, iam, lambda, vpc, ...
│   └── environments/prod/
├── scripts/               # bootstrap-test-app, build-lambda-packages, initial_load
├── .github/workflows/
├── docker-compose.local.yml
└── xls/                   # Local sample XLSX (not committed)
```
