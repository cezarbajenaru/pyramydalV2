# PyramydalV2 Architecture

> **Consolidated guide:** [GUIDE.md](GUIDE.md). This file is extended reference.

## System Overview
PyramydalV2 is an AWS-based data platform replacing spreadsheet-based production tracking with scalable storage, automated calculations, and a project-owned web UI.

## Core Components
- **RDS PostgreSQL**: primary transactional and reference data store.
- **S3**: upload/export object storage with versioning.
- **Lambda**:
  - import pipeline for XLSX ingestion and validation
  - scheduled recalculation pipeline (`rate(15 minutes)`).
- **In-house UI (React/Vite)**: Appsmith-like operator workflow tailored to this project.
- **Backend API (FastAPI)**: one implementation for production and localstack test mode.
- **Terraform**: infrastructure provisioning and drift control.
- **GitHub Actions**: Terraform and Lambda CI/CD.

## High-Level Data Flow
1. User uploads reference files or edits production rows through UI.
2. UI calls backend APIs/Lambda-facing services.
3. Data lands in S3 and/or PostgreSQL staging tables.
4. Validation + swap logic publishes to live tables.
5. Recalc Lambda updates derived columns and writes run metrics.
6. UI surfaces latest table data, import status, and recalc status.

## Networking and Security
- RDS in private subnets.
- Lambda in VPC for private DB access.
- S3 access via IAM roles/policies.
- Encryption at rest for DB/S3.
- Auditing through DB audit tables and CloudWatch logs.

## Operations
- Scheduled recalc every 15 minutes.
- Import and recalc runs tracked in audit tables.
- Terraform pipeline validates on PR and applies on main.

## UI Direction
The repository no longer depends on Appsmith deployment artifacts.
The in-house UI targets:
- left nav + table workspace + right-side action/properties panel
- main rows pagination/edit/save
- reference data views
- import/recalc/export operational controls

## Localstack Readiness
UI and backend use environment-driven endpoints.
Localstack testing targets same backend contracts and runtime code path as production.
