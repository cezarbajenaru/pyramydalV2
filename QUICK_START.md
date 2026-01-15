# Quick Start Guide

## Prerequisites

- AWS account with admin access
- Terraform >= 1.5
- Python 3.11+
- psql (PostgreSQL client)
- Git

## Step-by-Step Setup (60 minutes)

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd pyramydalV2
```

### 2. Generate Secrets

```bash
# CRITICAL: Store these securely! Never lose them!
export APPSMITH_ENCRYPTION_PASSWORD=$(openssl rand -base64 32)
export APPSMITH_ENCRYPTION_SALT=$(openssl rand -base64 32)

echo "Save these to your password manager:"
echo "APPSMITH_ENCRYPTION_PASSWORD=$APPSMITH_ENCRYPTION_PASSWORD"
echo "APPSMITH_ENCRYPTION_SALT=$APPSMITH_ENCRYPTION_SALT"

# Strong DB password
export DB_PASSWORD=$(openssl rand -base64 20)
echo "DB_PASSWORD=$DB_PASSWORD"
```

### 3. Create EC2 SSH Key

```bash
# Create SSH key pair in AWS Console or:
aws ec2 create-key-pair \
  --key-name pyramydal-prod-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/pyramydal-prod-key.pem

chmod 400 ~/.ssh/pyramydal-prod-key.pem
```

### 4. Configure Terraform Backend

```bash
# Create S3 bucket for Terraform state
aws s3 mb s3://pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text) --region eu-central-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text) \
  --versioning-configuration Status=Enabled
```

### 5. Configure Terraform Variables

```bash
cd infra/terraform/environments/prod

# Copy example
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

**Required values:**
- `ec2_key_name` = "pyramydal-prod-key"
- `db_password` = (from step 2)
- `appsmith_encryption_password` = (from step 2)
- `appsmith_encryption_salt` = (from step 2)
- `allowed_ips` = ["YOUR_IP/32"]  # Get your IP: curl ifconfig.me

### 6. Deploy Infrastructure

```bash
# Still in: infra/terraform/environments/prod

# Initialize
terraform init \
  -backend-config="bucket=pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text)" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=eu-central-1"

# Plan (review changes)
terraform plan

# Apply (takes ~10 minutes)
terraform apply

# Save outputs
terraform output > ../../../../terraform-outputs.txt
```

### 7. Initialize Database

```bash
# Get RDS endpoint
RDS_ENDPOINT=$(terraform output -raw rds_address)

# Connect (from project root)
cd ../../../../
psql -h $RDS_ENDPOINT -U admin -d production

# Run schema scripts
\i db/schema/001_init.sql
\i db/schema/002_staging_and_audit.sql
\i db/schema/003_recalc_procedures.sql

# Verify tables created
\dt app.*

# Exit psql
\q
```

### 8. Build and Deploy Lambda Functions

```bash
# Build packages
chmod +x scripts/build-lambda-packages.sh
./scripts/build-lambda-packages.sh

# Packages created in lambda/*/package.zip

# Deploy via Terraform
cd infra/terraform/environments/prod
terraform apply -auto-approve  # Will update Lambda function code
```

### 9. Access Appsmith

```bash
# Get Appsmith IP
APPSMITH_IP=$(terraform output -raw appsmith_public_ip)

echo "Appsmith URL: https://$APPSMITH_IP"
```

**In browser:**
1. Navigate to `https://<appsmith-ip>` (accept self-signed cert warning)
2. Create admin account (first user becomes admin)
3. Complete onboarding wizard

### 10. Configure Appsmith Datasource

**In Appsmith UI:**
1. Go to **Datasources** → **+ New Datasource** → **PostgreSQL**
2. Name: `PyramydalDB`
3. Connection:
   - Host: `<rds-endpoint>` (from terraform output)
   - Port: `5432`
   - Database: `production`
   - Username: `admin`
   - Password: `<from terraform.tfvars>`
4. **Test** → **Save**

### 11. Load Initial Data

```bash
# Install dependencies
pip3 install psycopg2-binary openpyxl

# Dry run first (no commit)
python3 scripts/initial_load.py \
  --excel xls/normare_utilaje_2024.xlsx \
  --sheet "PAGINA PRINCIPALA" \
  --db-host $RDS_ENDPOINT \
  --db-user admin \
  --db-password $DB_PASSWORD \
  --dry-run

# If looks good, load for real
python3 scripts/initial_load.py \
  --excel xls/normare_utilaje_2024.xlsx \
  --sheet "PAGINA PRINCIPALA" \
  --db-host $RDS_ENDPOINT \
  --db-user admin \
  --db-password $DB_PASSWORD
```

### 12. Import Reference Data

**Via Appsmith UI (recommended):**
1. Go to **Uploads** page (once you create it)
2. Upload `Lista programe.xlsx`
3. Wait for import success

**Or via CLI:**
```bash
# Upload to S3
aws s3 cp xls/Lista\ programe.xlsx \
  s3://pyramydal-prod-files/uploads/lista_programe/

# Trigger import
aws lambda invoke \
  --function-name pyramydal-prod-import \
  --payload '{
    "s3_key": "uploads/lista_programe/Lista programe.xlsx",
    "import_type": "lista_programe",
    "uploaded_by": "admin@example.com"
  }' \
  /tmp/import-result.json

# Check result
cat /tmp/import-result.json | jq
```

### 13. Test Recalculation

```bash
# Trigger manual recalc
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "admin"}' \
  /tmp/recalc-result.json

# Check result
cat /tmp/recalc-result.json | jq

# Verify derived columns populated
psql -h $RDS_ENDPOINT -U admin -d production -c \
  "SELECT COUNT(*) FROM app.main_rows WHERE timp_per_buc IS NOT NULL;"
```

### 14. Build Appsmith UI

Follow instructions in `appsmith/UI_DESIGN.md` to create:
- Main Table page
- Reference Lists pages
- Uploads page
- Export page

**Or import pre-built application:**
- (If you've exported an Appsmith app JSON, place it in `appsmith/` and import via UI)

---

## Verification Checklist

Before inviting users:

- [ ] Can access Appsmith via HTTPS
- [ ] PostgreSQL has ~75k rows in `main_rows`
- [ ] Lista Programe has ~42k rows
- [ ] Recalc runs without errors
- [ ] >90% of rows have derived columns populated
- [ ] Can edit a cell and save successfully
- [ ] Can export to Excel
- [ ] Scheduled recalc running every 15 minutes (check CloudWatch logs)
- [ ] Backups enabled (RDS automated backups, S3 versioning)
- [ ] Monitoring dashboard shows metrics
- [ ] Only whitelisted IPs can access

---

## Common Issues

### Issue: Terraform fails with "InvalidPermissions"
**Solution:** Ensure your AWS user has admin permissions or required IAM policies

### Issue: Cannot connect to RDS
**Solution:** Ensure you're connecting from allowed IP (EC2 or VPN). RDS is in private subnet.

### Issue: Appsmith shows "Failed to connect to datasource"
**Solution:** 
1. Check RDS endpoint is correct
2. Ensure security group allows EC2 → RDS connection
3. Verify DB password is correct

### Issue: Lambda timeout during import
**Solution:** Increase Lambda timeout to 10 minutes (default 5 min may be tight for large files)

### Issue: "ERROR: relation does not exist"
**Solution:** Re-run database schema scripts (001, 002, 003)

---

## Next Steps

1. **Create Appsmith UI** - Follow `appsmith/UI_DESIGN.md`
2. **Train users** - Create walkthrough video
3. **Set up monitoring** - Configure CloudWatch alarms
4. **Enable HTTPS** - Set up Let's Encrypt or ALB + ACM
5. **Configure backups** - Automate EBS snapshots

---

## Documentation

- **Architecture:** `docs/architecture.md`
- **Data Model:** `docs/data-model.md`
- **Import Flow:** `docs/import-flow.md`
- **Recalc Logic:** `docs/recalc-logic.md`
- **Operations:** `docs/runbook.md`
- **MVP Plan:** `docs/mvp-plan.md`
- **Appsmith UI:** `appsmith/UI_DESIGN.md`

---

## Support

For issues or questions:
- Check `docs/runbook.md` for troubleshooting
- Review CloudWatch logs
- Contact platform engineering team

---

## Cost Estimate

**Monthly:** ~$120-150
- RDS: $35
- EC2: $35
- NAT: $35
- Storage: $15
- Other: $5

**Cheaper than:** 5 users × $50/user/month = $250 (SaaS alternative)

