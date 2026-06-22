# PyramydalV2 Implementation Summary

> **Start here:** [docs/GUIDE.md](docs/GUIDE.md)

## Current State
- Terraform-managed AWS platform for data and automation is in place.
- PostgreSQL schema + audit/recalc procedures exist under `db/schema`.
- Lambda import/recalc services exist and are deployable via CI.
- Appsmith integration has been removed from infrastructure, workflows, and docs.

## Platform Components
- **Data**: RDS PostgreSQL (source of truth)
- **Storage**: S3 (uploads/exports/versioning)
- **Automation**: Lambda import + recalc + EventBridge schedule
- **Infra as Code**: Terraform
- **CI/CD**: GitHub Actions (`terraform.yml`, `deploy-lambda.yml`)
- **UI**: in-house React/Vite app under `ui/`

## In-House UI Scope
Phase-1 implementation targets:
1. Main rows grid with server-side pagination
2. Inline edit + save flow
3. Recalculation status visibility
4. Foundation for reference lists/uploads/exports

## Localstack Compatibility Direction
The UI and integration layer use environment-based endpoint selection so local AWS emulation (localstack) can be introduced without refactoring core UI logic.

## Next Technical Milestones
1. Complete first functional vertical slice (list/edit/save).
2. Add localstack profile files and docker-compose wiring.
3. Add local integration tests for import/recalc/export API contracts.
