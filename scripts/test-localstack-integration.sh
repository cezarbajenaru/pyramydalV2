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

echo "[3/6] Applying migrations..."
export PYTHONPATH="$ROOT_DIR"
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-5433}"
export DB_NAME="${DB_NAME:-production}"
export DB_USER="${DB_USER:-admin}"
export DB_PASSWORD="${DB_PASSWORD:-admin}"
"$ROOT_DIR/scripts/db-migrate.sh"

echo "[4/6] Restarting backend to pick latest code..."
docker compose -f docker-compose.local.yml restart backend

echo "[5/6] Waiting for backend health..."
for i in $(seq 1 60); do
  if curl -sSf http://localhost:8001/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -sSf http://localhost:8001/health >/dev/null

echo "[6/6] Running API smoke tests..."
python3 scripts/localstack_api_smoke_test.py

echo "All localstack integration checks passed."
