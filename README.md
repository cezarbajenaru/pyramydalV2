# PyramydalV2 - Excel Replacement Platform

Internal AWS-based platform for managing production data (75k+ rows) with automated calculations and reference data management.

## Problem Statement
- Current Excel file (~75,000 rows) takes 1.5 hours to load
- Manual VLOOKUP/INDEX-MATCH formulas across multiple reference files
- No audit trail or concurrent editing capability
- No automation for derived calculations

## Solution Architecture
- **Database**: RDS PostgreSQL (single source of truth)
- **Storage**: S3 (XLSX uploads with versioning)
- **Compute**: Lambda (import + scheduled recalc every 15 min)
- **UI**: Appsmith on EC2 (Excel-like editable grid)
- **CI/CD**: GitHub Actions + Terraform

## Repository Structure
```
pyramydalV2/
├── infra/              # Terraform infrastructure
├── lambda/             # Import and recalculation functions
├── db/                 # Database schema and migrations
├── appsmith/           # UI deployment configs
├── docs/               # Architecture and runbooks
├── .github/workflows/  # CI/CD pipelines
└── xls/                # Sample/reference XLSX files (not committed)
```

## Quick Start

### Prerequisites
- AWS account with appropriate permissions
- Terraform >= 1.5
- Docker & Docker Compose
- Python 3.11+

### Initial Setup
```bash
# 1. Configure AWS credentials
aws configure

# 2. Initialize Terraform
cd infra/terraform/environments/prod
terraform init

# 3. Deploy infrastructure
terraform plan
terraform apply

# 4. Initialize database
psql -h <rds-endpoint> -U admin -d production -f ../../db/schema/001_init.sql

# 5. Deploy Appsmith
ssh ec2-user@<appsmith-ec2>
cd /opt/appsmith
docker-compose up -d
```

## Key Features
- Server-side pagination (handles 75k+ rows efficiently)
- Real-time edit tracking (updated_by, updated_at)
- Automated recalculation every 15 minutes
- XLSX import with validation and staging
- Full audit trail for imports and recalculations
- Role-based access control
- Export to XLSX/CSV

## Documentation
- [Architecture Overview](docs/architecture.md)
- [Data Model](docs/data-model.md)
- [Import Flow](docs/import-flow.md)
- [Recalculation Logic](docs/recalc-logic.md)
- [Operations Runbook](docs/runbook.md)
- [MVP Milestone Plan](docs/mvp-plan.md)

## Support
For issues or questions, contact the platform engineering team.

