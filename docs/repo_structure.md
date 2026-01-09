excel-platform/
├── README.md
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
│   │   │   ├── ec2_appsmith/
│   │   │   ├── iam/
│   │   │   └── lambda/
│   │   ├── environments/
│   │   │   ├── dev/
│   │   │   └── prod/
│   │   └── main.tf
│   │
│   └── scripts/
│       └── bootstrap.sh
│
├── appsmith/
│   ├── docker-compose.yml
│   ├── env.example
│   └── volumes.md
│
├── db/
│   ├── schema/
│   │   ├── 001_init.sql
│   │   ├── 002_reference_tables.sql
│   │   └── 003_indexes.sql
│   │
│   └── migrations/
│
├── lambda/
│   ├── import_reference/
│   │   ├── handler.py
│   │   └── requirements.txt
│   └── recalc/
│       ├── handler.py
│       └── requirements.txt
│
├── .github/
│   └── workflows/
│       ├── terraform.yml
│       └── deploy-appsmith.yml
│
└── .gitignore
