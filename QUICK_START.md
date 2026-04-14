# Quick Start Guide

## Prerequisites
- AWS account with admin access
- Terraform >= 1.5
- Python 3.11+
- `psql` PostgreSQL client
- Node.js 20+ and npm (for new UI)

## Setup (Core Infra + Data)

### 1) Clone repository
```bash
git clone <your-repo-url>
cd pyramydalV2
```

### 2) Generate DB secret
```bash
export DB_PASSWORD=$(openssl rand -base64 20)
echo "DB_PASSWORD=$DB_PASSWORD"
```

### 3) Configure Terraform backend
```bash
aws s3 mb s3://pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text) --region eu-central-1
aws s3api put-bucket-versioning \
  --bucket pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text) \
  --versioning-configuration Status=Enabled
```

### 4) Configure Terraform variables
```bash
cd infra/terraform/environments/prod
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars
```

Required values:
- `db_password`
- `db_username` (default `admin` is fine)
- `environment` (`prod`)

### 5) Deploy infrastructure
```bash
terraform init \
  -backend-config="bucket=pyramydal-terraform-state-$(aws sts get-caller-identity --query Account --output text)" \
  -backend-config="key=prod/terraform.tfstate" \
  -backend-config="region=eu-central-1"

terraform plan
terraform apply
```

### 6) Initialize database
```bash
RDS_ENDPOINT=$(terraform output -raw rds_address)
cd ../../../../
psql -h "$RDS_ENDPOINT" -U admin -d production -f db/schema/001_init.sql
psql -h "$RDS_ENDPOINT" -U admin -d production -f db/schema/002_staging_and_audit.sql
psql -h "$RDS_ENDPOINT" -U admin -d production -f db/schema/003_recalc_procedures.sql
```

### 7) Build/deploy Lambda packages
```bash
chmod +x scripts/build-lambda-packages.sh
./scripts/build-lambda-packages.sh
cd infra/terraform/environments/prod
terraform apply -auto-approve
```

### 8) Load initial data
```bash
pip3 install psycopg2-binary openpyxl
python3 scripts/initial_load.py \
  --excel xls/normare_utilaje_2024.xlsx \
  --sheet "PAGINA PRINCIPALA" \
  --db-host "$RDS_ENDPOINT" \
  --db-user admin \
  --db-password "$DB_PASSWORD"
```

### 9) Verify recalculation
```bash
aws lambda invoke \
  --function-name pyramydal-prod-recalc \
  --payload '{"triggered_by": "manual", "triggered_by_user": "admin"}' \
  /tmp/recalc-result.json
```

## UI (In-House)
In-house UI lives in `ui/` and replaces previous Appsmith integration.

Expected first milestone:
- Main rows list with pagination
- Inline edit + save
- Recalculation status indicator

## Localstack Compatibility (Planned)
Single backend implementation is shared between production and localstack.

### Localstack stack
```bash
docker compose -f docker-compose.local.yml up -d
```

Then run UI against backend:
```bash
cd ui
cp .env.localstack .env.local
npm run dev
```

