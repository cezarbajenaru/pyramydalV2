Below is an end-to-end, production-capable plan you can follow from A to Z, with the minimal amount of moving parts, and with the specific pitfalls you raised (state persistence, upgrades, “not rebuilding twice”) handled correctly. I’m going to describe a “boring but correct” AWS setup: RDS Postgres + S3 + Appsmith on EC2 + scheduled recalculation job.

A. Inventory and decisions (before any AWS work)

Identify the datasets:

Main table (100k rows) users edit.

Reference lists: price_list, timing_list, cnc_times.

Define join keys for each merge (must be stable keys).

Classify columns:

User-editable inputs (never overwritten).

Derived outputs (always overwritten by automation).

Decide automation behavior:

Runs every 15 minutes.

Optionally a manual “Run now” button.

B. AWS foundation (network + security)

VPC choice:

If you already have a VPC standard at work, reuse that pattern.

Otherwise create a simple VPC: public subnet for Appsmith EC2; private subnet for RDS (recommended).

Security groups:

SG-Appsmith: inbound 443 from your office IPs (or VPN), outbound allowed.

SG-RDS: inbound 5432 only from SG-Appsmith and from Lambda (if Lambda in VPC).

IAM baseline:

EC2 role (optional) for reading SSM parameters (Appsmith secrets) and maybe S3 downloads.

Lambda role for S3 read, CloudWatch logs, and (if needed) VPC access.

C. Data layer (RDS PostgreSQL)

Create RDS Postgres:

db.t4g.small if several users will edit; db.t4g.micro if 1–2 users and light usage.

Multi-AZ: optional; costs more, improves availability.

Storage: gp3 20–50 GB is fine.

Enable:

Automated backups (7–14 days).

Minor version upgrades: choose manual if you want more control.

Create database objects:

Schema: app (or public).

Tables:

main_rows

price_list

timing_list

cnc_times

imports_audit (tracks file uploads and runs)

optionally: staging tables for each reference list (recommended)

Indexes (critical):

Index join keys on main_rows and each reference table.

Index the most common search fields.

Optional but recommended:

Row “updated_at” and “updated_by” audit columns in main_rows.

D. File layer (S3)

Create bucket, enable:

Versioning (so you can rollback bad uploads).

SSE-S3 or SSE-KMS (either is fine; SSE-S3 is simpler).

Folder convention (prefixes):

uploads/price_list/

uploads/timing_list/

uploads/cnc_times/

exports/

Lifecycle rules (optional):

Keep old versions for X months.

E. Import pipeline (Excel → DB)
You have two practical ways:

Option 1 (clean): upload Excel, convert and load server-side

User uploads XLSX/CSV through Appsmith (or a separate simple upload endpoint).

File goes to S3.

Lambda parses it and loads into staging tables.

Validate, then swap to live table.

Option 2 (simplest early): require CSV uploads

Users export to CSV from Excel.

Upload CSV.

Lambda loads CSV directly (fast and robust).

The reliable pattern is “staging + validate + swap”
For each reference list import:

Load into staging table (truncate then copy).

Validate:

row count > 0

required columns exist

no duplicate keys (or handle deterministically)

Swap:

In one transaction: replace live table contents from staging.

Write an imports_audit row:

which file, who, when, row counts, success/fail reason.

F. Recalculation job (every 15 minutes)

Schedule:

EventBridge rule: cron every 15 minutes.

Execution:

Lambda (Python) connects to RDS (preferably via RDS Proxy if you later have many connections; not required at first).

Logic:

SQL-based update joins, e.g.:

update main_rows derived_price from price_list

update main_rows derived_time from timing_list

update main_rows cnc_cycle_time from cnc_times

Safety:

Only overwrite derived columns.

Track run stats (rows updated) in imports_audit or a runs table.

Performance:

Ensure join keys are indexed.

Use set-based UPDATE … FROM, not row-by-row loops.

G. UI layer (Appsmith on EC2)

Deploy Appsmith (stateful, safe)

Run Appsmith using official docker-compose.

Use persistent volumes (named volumes or bind mount on EBS).

Set fixed encryption secrets (do not regenerate).

HTTPS

Prefer ALB + ACM cert in front of EC2 (cleanest).

Alternative: Nginx on EC2 + Let’s Encrypt.

Authentication

Start with Appsmith built-in auth (email/password).

Later integrate SSO (Cognito/Google Workspace) if needed.

H. Appsmith application design (what users see)
Pages:

Main Table

Editable grid for main_rows

Server-side pagination (LIMIT/OFFSET or keyset)

Search/filter UI

Derived columns read-only

Reference Lists

Price List page (view/edit optional; ideally edit through imports)

Timing List page

CNC Times page

Uploads / Imports

Upload buttons for each reference list

Show last uploaded time, last run status, errors

Exports

Export current filtered view (CSV/XLSX)

Key UX decisions:

Do not allow users to “open 100k rows” as a single page.

Provide saved views / filters.

Make derived fields clearly labeled and locked.

I. CI/CD (pipeline) that will not reset Appsmith

Infrastructure pipeline (Terraform)

Plan/apply for RDS, S3, SGs, EC2, ALB, IAM, EventBridge, Lambda.

Appsmith deployment pipeline

Never delete volumes.

Pin Appsmith image version tag.

Deploy steps:

docker compose pull (pinned version)

docker compose up -d

Secrets management

Store encryption password/salt in SSM or Secrets Manager.

Pipeline reads and applies consistently.

J. Operations and guardrails

Backups

RDS automated backups.

S3 versioning.

EBS snapshots for Appsmith volume (optional but recommended before upgrades).

Monitoring

CloudWatch alarms for:

Lambda errors

RDS CPU/storage

EC2 disk usage

Access control

Restrict Appsmith inbound by IP or VPN if internal.

Keep RDS private; no public exposure.

K. Go-live checklist

Load sample dataset, test:

search speed

edits

recalc correctness

Validate “bad upload” handling:

duplicate keys

missing columns

Confirm run cadence:

every 15 minutes updates derived columns

Train users:

“This replaces formulas; derived columns update automatically.”

The only “unknown” that can change the whole project cost/time
Join key quality. If your lists don’t share stable keys, you will need a mapping/normalization step (a “dictionary” table) and a UI workflow to resolve unmatched items. That is still doable, but it’s a different scope.

If you want, I can turn the above into a concrete implementation blueprint for you:

Terraform module list (RDS, S3, EC2/ALB, Lambda, EventBridge)

Minimal Postgres schema (DDL)

Example SQL update statements for the recalc

Appsmith page/query structure (how to do pagination + filtering properly)

To do that accurately, I need only one thing from you: the join keys (column names) for main_rows ↔ each reference list. Even approximate names are enough.
