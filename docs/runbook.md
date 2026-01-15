# Operations Runbook

## Table of Contents
1. [Initial Setup](#initial-setup)
2. [Daily Operations](#daily-operations)
3. [Common Tasks](#common-tasks)
4. [Troubleshooting](#troubleshooting)
5. [Incident Response](#incident-response)
6. [Maintenance](#maintenance)

---

## Initial Setup

### Prerequisites
- AWS account with admin access
- GitHub account
- SSH key pair for EC2
- Domain name (optional, for HTTPS)

### Step 1: Generate Secrets

```bash
# Generate Appsmith encryption secrets (CRITICAL - store securely!)
ENCRYPTION_PASSWORD=$(openssl rand -base64 32)
ENCRYPTION_SALT=$(openssl rand -base64 32)

echo "APPSMITH_ENCRYPTION_PASSWORD=$ENCRYPTION_PASSWORD"
echo "APPSMITH_ENCRYPTION_SALT=$ENCRYPTION_SALT"

# Store in password manager (never lose these!)
```

### Step 2: Create S3 Backend for Terraform

```bash
# Create S3 bucket for Terraform state
aws s3 mb s3://pyramydal-terraform-state --region eu-central-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket pyramydal-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket pyramydal-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### Step 3: Configure Terraform Variables

```bash
cd infra/terraform/environments/prod

# Copy example
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

Required values:
- `db_password` - Strong password (20+ chars)
- `ec2_key_name` - Your SSH key pair name
- `allowed_ips` - Your office/VPN IP ranges
- `appsmith_encryption_password` - From Step 1
- `appsmith_encryption_salt` - From Step 1

### Step 4: Deploy Infrastructure

```bash
# Initialize Terraform
terraform init \
  -backend-config="bucket=pyramydal-terraform-state" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=eu-central-1"

# Plan
terraform plan -out=tfplan

# Apply (will take 10-15 minutes)
terraform apply tfplan

# Save outputs
terraform output > outputs.txt
```

### Step 5: Initialize Database

```bash
# Get RDS endpoint
RDS_ENDPOINT=$(terraform output -raw rds_address)

# Connect via psql (from EC2 or local with VPN)
psql -h $RDS_ENDPOINT -U admin -d production

# Run schema scripts
\i db/schema/001_init.sql
\i db/schema/002_staging_and_audit.sql
\i db/schema/003_recalc_procedures.sql

# Verify
\dt app.*
```

### Step 6: Access Appsmith

```bash
# Get Appsmith IP
APPSMITH_IP=$(terraform output -raw appsmith_public_ip)

# Access in browser
open https://$APPSMITH_IP

# Create admin account (first user becomes admin)
```

### Step 7: Configure Appsmith Datasource

1. In Appsmith UI, go to **Datasources**
2. Click **+ New Datasource** → **PostgreSQL**
3. Enter connection details:
   - **Host:** `<rds-endpoint>`
   - **Port:** `5432`
   - **Database:** `production`
   - **Username:** `admin`
   - **Password:** `<from terraform.tfvars>`
4. Test connection → Save

### Step 8: Initial Data Load

```python
# Load existing Excel data
python scripts/initial_load.py \
  --excel xls/normare_utilaje_2024.xlsx \
  --db-host <rds-endpoint> \
  --db-name production \
  --db-user admin \
  --db-password <password>
```

### Step 9: Verify Recalc

```bash
# Manually trigger first recalc
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "admin"}' \
  /tmp/recalc-output.json

# Check results
cat /tmp/recalc-output.json | jq
```

---

## Daily Operations

### Morning Checks (5 minutes)

```bash
# 1. Check Appsmith health
curl -f https://<appsmith-ip>/api/v1/health

# 2. Check last recalc run
aws logs tail /aws/lambda/pyramydal-prod-recalc --since 1h

# 3. Check RDS metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=pyramydal-prod-postgres \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average

# 4. Check recent imports
psql -h <rds-endpoint> -U admin -d production -c \
  "SELECT import_type, status, rows_loaded, started_at FROM app.v_recent_imports LIMIT 10;"
```

### Weekly Review (15 minutes)

```sql
-- Connect to PostgreSQL
psql -h <rds-endpoint> -U admin -d production

-- 1. Check data growth
SELECT 
    'main_rows' as table,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('app.main_rows')) as size
FROM app.main_rows
WHERE deleted_at IS NULL;

-- 2. Import success rate
SELECT 
    import_type,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
    ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM app.imports_audit
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY import_type;

-- 3. Recalc performance
SELECT 
    AVG(execution_time_ms) as avg_ms,
    MAX(execution_time_ms) as max_ms,
    AVG(rows_updated) as avg_rows_updated
FROM app.recalc_runs
WHERE started_at >= NOW() - INTERVAL '7 days'
  AND status = 'success';

-- 4. Unmatched rows
SELECT COUNT(*) as unmatched_count
FROM app.v_unmatched_main_rows;
```

---

## Common Tasks

### Task: Upload New Lista Programe

**Via Appsmith UI:**
1. Go to **Uploads** page
2. Select **Import Type:** Lista Programe
3. Click **Choose File** → select XLSX
4. Click **Upload**
5. Wait for validation (progress indicator)
6. Check **Import History** for success/errors

**Via CLI (for bulk/automated uploads):**
```bash
# Upload to S3
aws s3 cp lista_programe_new.xlsx \
  s3://pyramydal-prod-files/uploads/lista_programe/

# Trigger import Lambda
aws lambda invoke \
  --function-name pyramydal-prod-import \
  --payload '{
    "s3_key": "uploads/lista_programe/lista_programe_new.xlsx",
    "import_type": "lista_programe",
    "uploaded_by": "admin@example.com"
  }' \
  /tmp/import-result.json

# Check result
cat /tmp/import-result.json | jq
```

### Task: Manual Recalculation

```bash
# Trigger recalc immediately (don't wait for next scheduled run)
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "operator@example.com"}' \
  /tmp/recalc-result.json

# View results
cat /tmp/recalc-result.json | jq '.rows_updated, .execution_time_ms'
```

### Task: Export Data

**Via Appsmith:**
1. Go to **Export** page
2. Select filters (date range, status, etc.)
3. Click **Export to Excel**
4. File downloads to browser

**Via CLI:**
```bash
# Direct PostgreSQL export
psql -h <rds-endpoint> -U admin -d production -c \
  "COPY (SELECT * FROM app.main_rows WHERE deleted_at IS NULL) TO STDOUT WITH CSV HEADER" \
  > main_rows_export_$(date +%Y%m%d).csv
```

### Task: Add New User

**Appsmith Users:**
1. Go to **Settings** → **Users**
2. Click **Invite Users**
3. Enter email, select role (Admin, Developer, Viewer)
4. User receives invite email

**Database Users (for direct DB access):**
```sql
CREATE USER readonly_user WITH PASSWORD 'secure_password';
GRANT USAGE ON SCHEMA app TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO readonly_user;
```

### Task: Backup Database

```bash
# Manual backup
pg_dump -h <rds-endpoint> -U admin -d production -Fc -f backup_$(date +%Y%m%d).dump

# Upload to S3
aws s3 cp backup_$(date +%Y%m%d).dump s3://pyramydal-prod-files/backups/database/
```

### Task: Restore from Backup

```bash
# Download backup
aws s3 cp s3://pyramydal-prod-files/backups/database/backup_20260110.dump .

# Restore (WARNING: will overwrite data!)
pg_restore -h <rds-endpoint> -U admin -d production -c backup_20260110.dump
```

### Task: Update Appsmith

```bash
# SSH to EC2
ssh -i ~/.ssh/pyramydal.pem ec2-user@<appsmith-ip>

# Backup first
cd /opt/appsmith
sudo tar -czf /tmp/appsmith-backup-$(date +%Y%m%d).tar.gz stacks/
aws s3 cp /tmp/appsmith-backup-*.tar.gz s3://pyramydal-prod-files/backups/appsmith/

# Update docker-compose.yml with new version
sudo nano docker-compose.yml
# Change: image: appsmith/appsmith-ce:v1.9.60

# Pull and restart
sudo docker-compose pull
sudo docker-compose up -d

# Check logs
sudo docker-compose logs -f
```

---

## Troubleshooting

### Issue: Appsmith not accessible

**Symptoms:** HTTPS timeout, connection refused

**Diagnosis:**
```bash
# Check EC2 is running
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=pyramydal-prod-appsmith" \
  --query 'Reservations[].Instances[].[InstanceId, State.Name, PublicIpAddress]'

# Check security group
aws ec2 describe-security-groups \
  --group-names pyramydal-prod-appsmith-sg

# SSH to EC2 and check Docker
ssh ec2-user@<appsmith-ip>
sudo docker-compose ps
sudo docker-compose logs
```

**Solutions:**
1. **If EC2 stopped:** Start instance via AWS Console
2. **If Docker not running:** `sudo docker-compose up -d`
3. **If IP not in whitelist:** Add to security group inbound rules

### Issue: Import failing with validation errors

**Symptoms:** Import status "failed", validation errors in UI

**Diagnosis:**
```sql
-- Check recent failed imports
SELECT import_id, file_name, validation_errors
FROM app.imports_audit
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 5;
```

**Common Errors:**

**Error: "Missing required columns"**
- **Cause:** Excel header names don't match expected
- **Fix:** Ensure headers match exactly (CLIENT, REPER, etc.) or update Lambda header mapping

**Error: "Duplicate keys"**
- **Cause:** Same reper+client appears multiple times
- **Fix:** Remove duplicates in Excel or change import to UPSERT mode

**Error: "Invalid numeric value"**
- **Cause:** Non-numeric in numeric column (e.g., "-", "N/A")
- **Fix:** Clean Excel data or update Lambda to handle gracefully

### Issue: Recalc not updating derived columns

**Symptoms:** Derived columns NULL or outdated

**Diagnosis:**
```sql
-- Check recent recalc runs
SELECT run_id, status, rows_updated, rows_unmatched, error_message
FROM app.recalc_runs
ORDER BY started_at DESC
LIMIT 10;

-- Check for unmatched keys
SELECT reper, client, nr_fisa
FROM app.v_unmatched_main_rows
LIMIT 20;
```

**Solutions:**
1. **If unmatched keys exist:** Import missing reference data (lista_programe)
2. **If recalc failed:** Check Lambda logs for errors
3. **If indexes missing:** Recreate indexes (see Maintenance section)

### Issue: Slow queries in Appsmith

**Symptoms:** Table takes >10 seconds to load

**Diagnosis:**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%main_rows%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'app'
ORDER BY idx_scan;
```

**Solutions:**
1. **Add indexes:** See db/schema/001_init.sql for index definitions
2. **VACUUM:** `VACUUM ANALYZE app.main_rows;`
3. **Increase page size:** Reduce rows per page in Appsmith table widget

### Issue: Lambda timeout

**Symptoms:** Import or recalc times out (5 min / 3 min)

**Diagnosis:**
```bash
# Check Lambda logs
aws logs tail /aws/lambda/pyramydal-prod-import --follow

# Check Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=pyramydal-prod-import \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

**Solutions:**
1. **Increase timeout:** Update Lambda configuration (5 min → 10 min)
2. **Increase memory:** More memory = more CPU (512 MB → 1024 MB)
3. **Optimize query:** Batch updates or add indexes

---

## Incident Response

### Severity Levels

**P1 (Critical):** System down, users cannot work
- **Response time:** 15 minutes
- **Example:** Appsmith unreachable, RDS down

**P2 (High):** Degraded functionality
- **Response time:** 1 hour
- **Example:** Slow queries, import failures

**P3 (Medium):** Minor issues
- **Response time:** 4 hours
- **Example:** Some derived columns not updating

### P1 Incident: Appsmith Down

**Steps:**
1. **Verify issue:** Access https://<appsmith-ip> from multiple locations
2. **Check EC2:** `aws ec2 describe-instance-status`
3. **Check Docker:** SSH to EC2, `sudo docker-compose ps`
4. **Restart if needed:** `sudo docker-compose restart`
5. **Check logs:** `sudo docker-compose logs -f`
6. **Notify users:** Email/Slack with status update
7. **Document:** Add incident to postmortem doc

### P1 Incident: RDS Down

**Steps:**
1. **Check RDS status:** AWS Console → RDS → Database
2. **Check CloudWatch alarms:** Look for CPU/storage/connection issues
3. **If Multi-AZ:** Failover is automatic (1-2 min downtime)
4. **If Single-AZ:** Restore from snapshot (30 min downtime)
5. **Notify users:** Email with estimated restoration time
6. **Root cause analysis:** Review RDS logs, metrics

### Data Loss Incident

**Steps:**
1. **Stop all writes:** Disable Appsmith access (security group)
2. **Assess damage:** Query deleted_at, compare row counts
3. **Restore from backup:**
   - RDS: Restore from automated snapshot
   - Appsmith: Restore from S3 tar.gz
4. **Verify data integrity:** Spot-check critical records
5. **Re-enable access:** Update security group
6. **Postmortem:** Document what happened, preventive measures

---

## Maintenance

### Weekly Maintenance (Sunday 2 AM, 30 min downtime)

```bash
# 1. Backup Appsmith
ssh ec2-user@<appsmith-ip>
cd /opt/appsmith
sudo tar -czf /tmp/appsmith-backup-$(date +%Y%m%d).tar.gz stacks/
aws s3 cp /tmp/appsmith-backup-*.tar.gz s3://pyramydal-prod-files/backups/appsmith/

# 2. VACUUM database
psql -h <rds-endpoint> -U admin -d production << EOF
VACUUM ANALYZE app.main_rows;
VACUUM ANALYZE app.lista_programe;
VACUUM ANALYZE app.price_list;
EOF

# 3. Reindex (if needed)
psql -h <rds-endpoint> -U admin -d production << EOF
REINDEX INDEX CONCURRENTLY app.idx_main_rows_reper_client;
EOF

# 4. Clean old logs
aws logs delete-log-group --log-group-name /aws/lambda/pyramydal-prod-recalc-old

# 5. Check disk space
aws ec2 describe-volumes \
  --filters "Name=tag:Name,Values=pyramydal-prod-appsmith-data" \
  --query 'Volumes[].Size'
```

### Monthly Maintenance (1st Sunday, 1 hour downtime)

```bash
# 1. Update Appsmith (if new version available)
# 2. Update Lambda runtime (if security patches)
# 3. Review CloudWatch alarms
# 4. Review user access (remove inactive users)
# 5. Review RDS performance insights
# 6. Test disaster recovery procedure
```

### Quarterly Maintenance

- Full disaster recovery drill
- Review and update documentation
- Security audit (IAM roles, S3 policies)
- Cost optimization review
- Performance baseline update

---

## Emergency Contacts

- **AWS Support:** [Support case via Console]
- **Database Admin:** db-admin@yourcompany.com
- **Platform Engineering:** platform-eng@yourcompany.com
- **On-Call:** +1-555-123-4567

---

## Useful Commands Cheat Sheet

```bash
# Connect to RDS
psql -h <rds-endpoint> -U admin -d production

# SSH to Appsmith
ssh -i ~/.ssh/pyramydal.pem ec2-user@<appsmith-ip>

# Check Appsmith logs
sudo docker-compose logs -f

# Restart Appsmith
sudo docker-compose restart

# Tail Lambda logs
aws logs tail /aws/lambda/pyramydal-prod-recalc --follow

# Trigger manual recalc
aws lambda invoke --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by":"manual"}' /tmp/out.json

# Check recent imports
psql ... -c "SELECT * FROM app.v_recent_imports LIMIT 10;"

# Backup database
pg_dump -h <rds-endpoint> -U admin -d production -Fc -f backup.dump

# Upload to S3
aws s3 cp file.txt s3://pyramydal-prod-files/path/

# Check EC2 status
aws ec2 describe-instances --filters "Name=tag:Name,Values=pyramydal-prod-appsmith"
```

