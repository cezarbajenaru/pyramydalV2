# PyramydalV2 Architecture

## System Overview

PyramydalV2 is an AWS-based Excel replacement platform designed to handle 75,000+ production job records with automated calculations, XLSX imports, and concurrent user editing.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Users (Multiple)                          │
│                     (Excel users, non-technical)                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Cloud Platform                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Appsmith on EC2 (Self-hosted)                           │   │
│  │  - Excel-like grid UI with pagination                    │   │
│  │  - Editable cells + read-only derived columns            │   │
│  │  - XLSX upload interface                                 │   │
│  │  - Export to XLSX/CSV                                    │   │
│  │  - Docker Compose deployment                             │   │
│  └────────┬──────────────────────────────────┬──────────────┘   │
│           │ SQL Queries                       │ File uploads     │
│           ▼                                   ▼                  │
│  ┌─────────────────────┐          ┌──────────────────────────┐ │
│  │  RDS PostgreSQL     │          │  S3 Bucket               │ │
│  │  - main_rows (75k)  │          │  - XLSX uploads          │ │
│  │  - lista_programe   │          │  - Versioning enabled    │ │
│  │  - price_list       │          │  - Lifecycle rules       │ │
│  │  - timing_list      │          │  - SSE encryption        │ │
│  │  - cnc_times        │          └──────────┬───────────────┘ │
│  │  - staging tables   │                     │                  │
│  │  - audit tables     │                     │                  │
│  └──────────┬──────────┘                     │                  │
│             │ ▲                               │                  │
│             │ │ UPDATE                        │ S3 GetObject     │
│             │ │ FROM joins                    │                  │
│             │ │                               ▼                  │
│             │ │                    ┌─────────────────────────┐  │
│             │ │                    │  Lambda: Import         │  │
│             │ │                    │  - Parse XLSX           │  │
│             │ │                    │  - Validate schema      │  │
│             │ │                    │  - Load to staging      │  │
│             │ │                    │  - Validate data        │  │
│             │ │                    │  - Swap to live table   │  │
│             │ └────────────────────┤  - Audit logging        │  │
│             │                      └─────────────────────────┘  │
│             │                                                    │
│             │                      ┌─────────────────────────┐  │
│             └──────────────────────│  Lambda: Recalc         │  │
│                                    │  - SQL UPDATE...FROM    │  │
│                                    │  - Every 15 minutes     │  │
│                                    │  - Manual trigger       │  │
│                                    │  - Performance logging  │  │
│                                    └──────────▲──────────────┘  │
│                                               │                  │
│                                    ┌──────────┴──────────────┐  │
│                                    │  EventBridge Rule       │  │
│                                    │  - Cron: rate(15 min)   │  │
│                                    └─────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │  CloudWatch                                                 ││
│  │  - Lambda logs, RDS metrics, Alarms                         ││
│  └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  CI/CD: GitHub Actions                                            │
│  - Terraform pipeline (infra changes)                             │
│  - Lambda deployment (code updates)                               │
│  - Appsmith deployment (version upgrades)                         │
└──────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. RDS PostgreSQL (Single Source of Truth)

**Purpose:** System of record for all production data

**Instance Type:** db.t4g.small (2 vCPU, 2 GB RAM)
- Handles 75k rows efficiently with proper indexing
- Multi-AZ optional for production HA

**Key Tables:**
- `main_rows` - Production job tracking (editable + derived columns)
- `lista_programe` - Program library (~42k rows)
- `price_list` - Pricing reference
- `timing_list` - Standard operation times
- `cnc_times` - CNC machine cycle times
- `staging_*` - Safe import zones
- `imports_audit` - Import operation tracking
- `recalc_runs` - Recalculation run tracking
- `user_edits` - Granular edit audit trail

**Performance Features:**
- Indexes on all join keys (reper, client, nr_fisa)
- Indexes on filter columns (status, data_livrare)
- Updated_at index for sorting recent changes
- Server-side pagination support (LIMIT/OFFSET)

**Backup Strategy:**
- Automated daily backups (14-day retention)
- Point-in-time recovery enabled
- S3 versioning for XLSX source files

### 2. S3 Bucket (File Storage)

**Purpose:** XLSX file storage with versioning

**Structure:**
```
s3://pyramydal-prod-files/
├── uploads/
│   ├── lista_programe/
│   ├── price_list/
│   ├── timing_list/
│   └── cnc_times/
├── exports/
└── backups/
    └── appsmith/
```

**Features:**
- Versioning enabled (rollback capability)
- SSE-S3 encryption at rest
- Lifecycle rules (expire old versions after 90 days)
- Public access blocked

### 3. Lambda Functions

#### 3A. Import Lambda (`pyramydal-prod-import`)

**Runtime:** Python 3.11  
**Timeout:** 5 minutes  
**Memory:** 512 MB  
**VPC:** Private subnet (access to RDS)

**Flow:**
1. Triggered by Appsmith (API call)
2. Downloads XLSX from S3
3. Parses with openpyxl
4. Validates schema (required columns, data types)
5. Loads to staging table
6. Runs SQL validation (duplicates, constraints)
7. Atomically swaps staging → live table
8. Logs success/failure to imports_audit

**Error Handling:**
- Validation errors returned to UI
- Partial imports rolled back
- Duplicate key handling (fail or upsert)

#### 3B. Recalc Lambda (`pyramydal-prod-recalc`)

**Runtime:** Python 3.11  
**Timeout:** 3 minutes  
**Memory:** 256 MB  
**VPC:** Private subnet (access to RDS)

**Schedule:** Every 15 minutes via EventBridge

**Flow:**
1. Calls PostgreSQL stored procedure: `recalc_derived_columns()`
2. Procedure executes SQL UPDATE...FROM joins:
   - Update `timp_per_buc`, `ore_totale` from `lista_programe`
   - Update `valoare_per_buc`, `valoare_totala` from `price_list`
3. Logs rows updated, matched, unmatched
4. Tracks execution time and performance metrics

**Optimization:**
- Set-based SQL (not row-by-row loops)
- Proper join indexes
- Only updates rows where reference data exists
- Tracks unmatched keys for troubleshooting

### 4. Appsmith on EC2

**Instance Type:** t3.medium (2 vCPU, 4 GB RAM)  
**Deployment:** Docker Compose (pinned version)  
**Persistent Storage:** EBS volume (50 GB, gp3, encrypted)

**Why Self-Hosted:**
- Full control over data residency
- No per-user licensing costs
- Custom domain and HTTPS via Let's Encrypt
- Direct PostgreSQL access (low latency)

**Critical Configuration:**
- **Encryption keys:** Never change after first setup (stored in SSM)
- **Volumes:** Named Docker volumes (persist across upgrades)
- **Backups:** Daily tar.gz to S3 + EBS snapshots

**Pages:**
1. Main Table (editable grid with pagination)
2. Reference Lists (view-only)
3. Uploads & Imports (XLSX upload + status)
4. Recalculation Control (trigger + history)
5. Export (filtered XLSX/CSV download)

### 5. Networking

**VPC Structure:**
- 2 public subnets (Appsmith EC2)
- 2 private subnets (RDS, Lambda)
- NAT Gateway (Lambda outbound access)
- Internet Gateway (Appsmith HTTPS access)

**Security Groups:**
- `SG-Appsmith`: Inbound 443 from allowed IPs, outbound all
- `SG-RDS`: Inbound 5432 from SG-Appsmith + SG-Lambda
- `SG-Lambda`: Outbound all

**Access Control:**
- Appsmith restricted by IP whitelist
- RDS private (no public endpoint)
- S3 bucket access via IAM roles only

### 6. CI/CD (GitHub Actions)

**Terraform Pipeline:**
- Plan on PR
- Apply on merge to main
- State stored in S3 backend
- Secrets from GitHub Secrets

**Lambda Deployment:**
- Build Python packages on push
- Create ZIP with dependencies
- Update Lambda function code
- Invoke test to verify

**Appsmith Deployment:**
- Manual workflow_dispatch
- SSH to EC2
- Pull new Docker image (pinned version)
- Restart containers (volumes persist)
- Health check verification

## Data Flow Scenarios

### Scenario 1: User Edits Cell

```
User edits "buc" in Appsmith
    ↓
UPDATE main_rows SET buc = 10, updated_by = 'user@email', updated_at = NOW()
    ↓
INSERT INTO user_edits (audit trail)
    ↓
Cell updates in UI (optimistic update)
    ↓
Next scheduled recalc (within 15 min)
    ↓
Derived columns updated: ore_totale = buc * timp_per_buc
```

### Scenario 2: XLSX Import

```
User uploads Lista Programe XLSX via Appsmith
    ↓
File uploaded to S3: uploads/lista_programe/file.xlsx
    ↓
Appsmith calls Lambda: TriggerImport(s3_key, import_type)
    ↓
Lambda downloads file from S3
    ↓
Lambda parses XLSX (openpyxl)
    ↓
Lambda validates: required columns, data types, duplicates
    ↓
Lambda loads to staging_lista_programe (TRUNCATE + INSERT)
    ↓
Lambda runs SQL validation function
    ↓
Lambda calls stored procedure: swap_staging_to_live()
    ↓
Stored procedure: BEGIN; TRUNCATE live; INSERT FROM staging; COMMIT;
    ↓
Lambda logs success to imports_audit
    ↓
Appsmith shows import success + row count
```

### Scenario 3: Scheduled Recalculation

```
EventBridge triggers Lambda every 15 minutes
    ↓
Lambda calls: recalc_derived_columns(triggered_by='scheduled')
    ↓
Stored procedure executes:
    UPDATE main_rows m
    SET timp_per_buc = lp.timpi_masinare,
        ore_totale = m.buc * lp.timpi_masinare
    FROM lista_programe lp
    WHERE m.reper = lp.reper AND m.client = lp.client
    ↓
Stored procedure logs run results to recalc_runs table
    ↓
Lambda returns success with stats (rows updated, execution time)
```

## Scalability Considerations

### Current Scale (75k rows)
- **Database:** db.t4g.small sufficient
- **Queries:** < 500ms with indexes
- **Recalc:** ~10-20 seconds
- **Concurrent users:** 5-10 simultaneous editors

### Future Scale (500k+ rows)
- Upgrade to db.t4g.medium (4 vCPU, 4 GB RAM)
- Add read replica for reporting queries
- Partition main_rows by date/status
- Implement RDS Proxy for connection pooling

## Cost Estimate (Monthly, EU-Central-1)

| Component | Instance Type | Hours | Cost |
|-----------|---------------|-------|------|
| RDS PostgreSQL | db.t4g.small | 730 | ~$35 |
| EC2 Appsmith | t3.medium | 730 | ~$35 |
| EBS (Appsmith) | 50 GB gp3 | - | ~$4 |
| RDS Storage | 50 GB gp3 | - | ~$6 |
| S3 Storage | ~10 GB | - | ~$0.25 |
| NAT Gateway | 1 | 730 | ~$35 |
| Lambda | ~5,000 invokes | - | ~$1 |
| Data Transfer | ~50 GB | - | ~$5 |
| **Total** | | | **~$120-150/month** |

*(Add ~30% for Multi-AZ RDS in production)*

## Disaster Recovery

### RTO (Recovery Time Objective): 2 hours
### RPO (Recovery Point Objective): 1 hour

**Backup Strategy:**
1. RDS automated daily backups (14-day retention)
2. S3 versioning (rollback bad imports)
3. EBS snapshots (Appsmith volumes, daily)
4. Appsmith tar.gz backups to S3 (daily)

**Recovery Procedure:**
1. Restore RDS from snapshot (30 min)
2. Launch new EC2 with restored EBS volume (15 min)
3. Restore Appsmith from tar.gz if needed (30 min)
4. Update DNS/Route53 (5 min)
5. Verify functionality (30 min)

## Monitoring & Alerting

**CloudWatch Alarms:**
- Lambda errors (immediate alert)
- RDS CPU > 80% (warning)
- RDS storage > 80% (warning)
- EC2 disk > 90% (critical)
- Recalc failures (2 consecutive)

**Metrics Dashboard:**
- Main rows count (trend)
- Average query time
- Recalc execution time
- Import success rate
- Active concurrent users

## Security

**Data at Rest:**
- RDS encryption enabled (AWS KMS)
- EBS encryption enabled
- S3 SSE-S3 encryption

**Data in Transit:**
- HTTPS only (Let's Encrypt certificate)
- RDS connections encrypted (SSL/TLS)

**Access Control:**
- IP whitelist for Appsmith
- IAM roles (principle of least privilege)
- RDS private subnet (no public access)
- Appsmith user authentication (email/password or SSO)

**Audit Trail:**
- user_edits table (all cell changes)
- imports_audit (all XLSX uploads)
- recalc_runs (all automation runs)
- CloudWatch logs (Lambda executions)

