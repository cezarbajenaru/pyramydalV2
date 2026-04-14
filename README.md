# PyramydalV2 - Excel Replacement Platform

Internal AWS platform for production data management (75k+ rows), automated recalculation, and project-owned UI.

## Problem Statement
- Current Excel workflow is slow at scale
- Manual cross-file formulas are error-prone
- No centralized audit trail or automation controls

## Current Architecture
- **Database**: RDS PostgreSQL (system of record)
- **Storage**: S3 (uploads/exports with versioning)
- **Compute**: Lambda (imports + scheduled recalculation)
- **Infrastructure**: Terraform
- **CI/CD**: GitHub Actions
- **Backend API**: single FastAPI service for prod + localstack tests
- **UI**: In-house web app (React/Vite)

## Repository Structure
```text
pyramydalV2/
├── infra/              # Terraform infrastructure
├── lambda/             # Import and recalculation functions
├── db/                 # Database schema and migrations
├── backend/            # Production backend API (shared with localstack tests)
├── ui/                 # In-house web UI (Appsmith-like UX)
├── docs/               # Architecture and operations
├── .github/workflows/  # CI/CD pipelines
└── xls/                # Sample/reference XLSX files (not committed)
```

## Quick Start
See `QUICK_START.md` for full setup.
Backend runs as single implementation path for both production and localstack.

## Key Features
- Scalable tabular data operations for 75k+ rows
- Scheduled derived-column recalculation every 15 minutes
- XLSX import pipeline with staging and validation
- Audit trail (`imports_audit`, `recalc_runs`, `user_edits`)
- Localstack-ready interfaces for future local testing

## Documentation
- [Architecture Overview](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Import Flow](docs/import-flow.md)
- [Recalculation Logic](docs/recalc-logic.md)
- [Operations Runbook](docs/runbook.md)
- [MVP Milestone Plan](docs/mvp-plan.md)

