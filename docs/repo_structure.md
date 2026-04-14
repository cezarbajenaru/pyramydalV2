excel-platform/
├── README.md
├── QUICK_START.md
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── import-flow.md
│   ├── recalc-logic.md
│   └── runbook.md
│
├── infra/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── rds/
│   │   │   ├── s3/
│   │   │   ├── iam/
│   │   │   └── lambda/
│   │   ├── environments/
│   │   │   └── prod/
│   │   └── main.tf
│   │
│   └── scripts/
│       └── bootstrap.sh
│
├── ui/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── db/
│   ├── schema/
│   │   ├── 001_init.sql
│   │   ├── 002_staging_and_audit.sql
│   │   └── 003_recalc_procedures.sql
│   └── migrations/
│
├── lambda/
│   ├── import_reference/
│   └── recalc/
│
├── .github/
│   └── workflows/
│       ├── terraform.yml
│       └── deploy-lambda.yml
│
└── .gitignore
