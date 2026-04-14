#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Starting localstack compose stack..."
docker compose -f docker-compose.local.yml up -d --build

echo "[2/6] Waiting for PostgreSQL..."
for i in $(seq 1 60); do
  if docker compose -f docker-compose.local.yml exec -T postgres pg_isready -U admin -d production >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "[3/6] Applying schema..."
docker compose -f docker-compose.local.yml exec -T postgres psql -U admin -d production < db/schema/001_init.sql
docker compose -f docker-compose.local.yml exec -T postgres psql -U admin -d production < db/schema/002_staging_and_audit.sql
docker compose -f docker-compose.local.yml exec -T postgres psql -U admin -d production < db/schema/003_recalc_procedures.sql

echo "[4/6] Seeding smoke-test data..."
docker compose -f docker-compose.local.yml exec -T postgres psql -U admin -d production < db/seed/001_localstack_smoke_seed.sql

echo "[4.5/6] Restarting backend to pick latest code..."
docker compose -f docker-compose.local.yml restart backend

echo "[5/6] Waiting for backend health..."
for i in $(seq 1 60); do
  if curl -sSf http://localhost:8000/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -sSf http://localhost:8000/health >/dev/null

echo "[6/6] Running API smoke tests..."
python3 scripts/localstack_api_smoke_test.py

echo "All localstack integration checks passed."
