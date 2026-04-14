# Operations Runbook

## Scope
This runbook covers operations for core AWS platform components:
- RDS PostgreSQL
- S3 storage
- Lambda import/recalc pipelines
- Backend API service (shared prod/localstack implementation)
- In-house UI service (project-owned)

## Initial Setup

### 1) Terraform deploy
```bash
cd infra/terraform/environments/prod
terraform init
terraform plan
terraform apply
```

### 2) DB initialization
```bash
RDS_ENDPOINT=$(terraform output -raw rds_address)
psql -h "$RDS_ENDPOINT" -U admin -d production -f db/schema/001_init.sql
psql -h "$RDS_ENDPOINT" -U admin -d production -f db/schema/002_staging_and_audit.sql
psql -h "$RDS_ENDPOINT" -U admin -d production -f db/schema/003_recalc_procedures.sql
```

### 3) Lambda packaging/deploy
```bash
./scripts/build-lambda-packages.sh
cd infra/terraform/environments/prod
terraform apply -auto-approve
```

## Daily Operations

### Morning checks
```bash
aws logs tail /aws/lambda/pyramydal-prod-recalc --since 1h
aws logs tail /aws/lambda/pyramydal-prod-import --since 1h
```

```sql
SELECT import_type, status, rows_loaded, started_at
FROM app.v_recent_imports
LIMIT 10;
```

### Recalc health
```sql
SELECT status, rows_updated, rows_unmatched, execution_time_ms, started_at
FROM app.recalc_runs
ORDER BY started_at DESC
LIMIT 20;
```

## Common Tasks

### Trigger manual recalc
```bash
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "operator@example.com"}' \
  /tmp/recalc-result.json
```

### Upload reference file and trigger import
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

## Troubleshooting

### Lambda failures
1. Check CloudWatch logs for stack trace.
2. Check DB connectivity from function VPC.
3. Verify S3 object key exists for imports.

### Slow recalculation
1. Inspect `app.recalc_runs.execution_time_ms` trend.
2. Run `VACUUM ANALYZE` on heavily updated tables.
3. Re-check indexes in schema scripts.

### Many unmatched rows
```sql
SELECT reper, client, nr_fisa
FROM app.v_unmatched_main_rows
LIMIT 50;
```
Import missing reference datasets, then rerun recalculation.

## Incident Response

### P1: System unavailable
1. Validate AWS service status (RDS/Lambda/S3).
2. Disable write operations if integrity risk exists.
3. Restore from latest verified backup if needed.
4. Communicate ETA and remediation steps.

### Data integrity incident
1. Freeze imports and edits.
2. Diff row counts and audit tables.
3. Restore and replay from trusted point.
4. Document root cause and preventive action.

## Maintenance

### Weekly
- `VACUUM ANALYZE` high-churn tables
- Review import/recalc success rates
- Validate backup completion

### Monthly
- Review IAM permissions and secrets hygiene
- Verify restore drill for RDS + critical datasets
- Review costs and scaling posture
