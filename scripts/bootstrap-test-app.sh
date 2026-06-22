#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ROOT_DIR
BACKEND_DIR="$ROOT_DIR/backend"
UI_DIR="$ROOT_DIR/ui"
VENV_DIR="$ROOT_DIR/.venv"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8001}"
UI_HOST="${UI_HOST:-0.0.0.0}"
UI_PORT="${UI_PORT:-5173}"

if [[ ! -d "$BACKEND_DIR" || ! -d "$UI_DIR" ]]; then
  echo "Expected backend/ and ui/ in: $ROOT_DIR"
  exit 1
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  if [[ -f "$ROOT_DIR/.env.example" ]]; then
    echo "Creating .env from .env.example ..."
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  else
    echo "Missing .env and .env.example"
    exit 1
  fi
fi

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating virtualenv at $VENV_DIR ..."
  python3 -m venv "$VENV_DIR"
fi

PIP_BIN="$VENV_DIR/bin/pip"
PYTHON_BIN="$VENV_DIR/bin/python"

if [[ ! -x "$PIP_BIN" || ! -x "$PYTHON_BIN" ]]; then
  echo "Missing .venv binaries. Recreate .venv or verify permissions."
  exit 1
fi

# Parse DB keys from .env with bash-only logic.
DB_HOST_VALUE="$(rg '^DB_HOST=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
DB_NAME_VALUE="$(rg '^DB_NAME=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
DB_PORT_VALUE="$(rg '^DB_PORT=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
DB_USER_VALUE="$(rg '^DB_USER=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
DB_PASSWORD_VALUE="$(rg '^DB_PASSWORD=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
SEED_FROM_XLSX_VALUE="$(rg '^SEED_FROM_XLSX=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
SEED_SHEET_VALUE="$(rg '^SEED_SHEET=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"
XLSX_PATH_VALUE="$(rg '^XLSX_PATH=' "$ROOT_DIR/.env" | awk -F= '{print $2}' | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" || true)"

DB_HOST_VALUE="${DB_HOST_VALUE:-localhost}"
DB_NAME_VALUE="${DB_NAME_VALUE:-production}"
DB_PORT_VALUE="${DB_PORT_VALUE:-5433}"
DB_USER_VALUE="${DB_USER_VALUE:-admin}"
DB_PASSWORD_VALUE="${DB_PASSWORD_VALUE:-admin}"
SEED_FROM_XLSX_VALUE="${SEED_FROM_XLSX_VALUE:-1}"
SEED_SHEET_VALUE="${SEED_SHEET_VALUE:-PAGINA PRINCIPALA}"

# Ensure docker postgres initialization uses same credentials as backend.
export POSTGRES_DB="$DB_NAME_VALUE"
export POSTGRES_USER="$DB_USER_VALUE"
export POSTGRES_PASSWORD="$DB_PASSWORD_VALUE"

# FIX 1: set PYTHONPATH so 'from backend.app.config import settings' resolves
export PYTHONPATH="$ROOT_DIR"

# FIX 2: include psycopg2 in the pre-flight check
if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, psycopg2, alembic" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  "$PIP_BIN" install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ ! -d "$UI_DIR/node_modules" ]]; then
  echo "Installing UI dependencies..."
  (cd "$UI_DIR" && npm install)
fi

if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, psycopg2, alembic" >/dev/null 2>&1; then
  echo "Backend dependencies still missing after install."
  echo "Check network/DNS/proxy and retry."
  exit 1
fi

if [[ "$SEED_FROM_XLSX_VALUE" == "1" ]] && ! "$PYTHON_BIN" -c "import openpyxl" >/dev/null 2>&1; then
  echo "Installing seed dependencies..."
  "$PIP_BIN" install openpyxl
fi

echo "Starting local postgres (docker compose)..."
if ! docker compose -f "$ROOT_DIR/docker-compose.local.yml" up -d postgres 2>&1; then
  echo "Failed to start postgres via docker compose."
  echo "Ensure Docker is running, then retry."
  exit 1
fi

echo "Waiting for database..."
# FIX 3: stderr is no longer suppressed so import errors surface immediately
if ! "$PYTHON_BIN" - <<'PY'
import sys
import time
import psycopg2
from backend.app.config import settings

for attempt in range(15):
    try:
        conn = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            connect_timeout=3,
        )
        conn.close()
        sys.exit(0)
    except Exception as e:
        print(f"  attempt {attempt + 1}/15: {e}", file=sys.stderr)
        time.sleep(2)

sys.exit(1)
PY
then
  echo "Database not ready. Recreating postgres volume and retrying once..."
  docker compose -f "$ROOT_DIR/docker-compose.local.yml" down -v >/dev/null 2>&1 || true
  if ! docker compose -f "$ROOT_DIR/docker-compose.local.yml" up -d postgres >/dev/null 2>&1; then
    echo "Failed to restart postgres."
    exit 1
  fi
  if ! "$PYTHON_BIN" - <<'PY'
import sys
import time
import psycopg2
from backend.app.config import settings

for attempt in range(15):
    try:
        conn = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            connect_timeout=3,
        )
        conn.close()
        sys.exit(0)
    except Exception:
        time.sleep(2)

sys.exit(1)
PY
  then
    echo "Database connection failed."
    echo "Run: docker compose -f docker-compose.local.yml logs postgres --tail 100"
    echo "Then verify .env DB credentials."
    exit 1
  fi
fi

echo "Database ready."

echo "Running database migrations..."
if ! PYTHONPATH="$ROOT_DIR" "$PYTHON_BIN" "$ROOT_DIR/scripts/db_migrate.py"; then
  echo "Failed to apply Alembic migrations."
  exit 1
fi

if [[ "$SEED_FROM_XLSX_VALUE" == "1" ]]; then
  echo "Loading initial data from XLSX..."

  XLSX_FILE=""
  if [[ -n "$XLSX_PATH_VALUE" ]]; then
    if [[ "$XLSX_PATH_VALUE" = /* ]]; then
      XLSX_FILE="$XLSX_PATH_VALUE"
    else
      XLSX_FILE="$ROOT_DIR/$XLSX_PATH_VALUE"
    fi
  else
    shopt -s nullglob
    xlsx_candidates=("$ROOT_DIR"/xls/*.xlsx)
    shopt -u nullglob
    if (( ${#xlsx_candidates[@]} > 0 )); then
      XLSX_FILE="${xlsx_candidates[0]}"
    fi
  fi

  if [[ -z "$XLSX_FILE" || ! -f "$XLSX_FILE" ]]; then
    echo "No XLSX file found for seed load."
    echo "Set XLSX_PATH in .env or add an .xlsx file under xls/."
    exit 1
  fi

  if ! "$PYTHON_BIN" "$ROOT_DIR/scripts/initial_load.py" \
    --excel "$XLSX_FILE" \
    --sheet "$SEED_SHEET_VALUE" \
    --db-host "$DB_HOST_VALUE" \
    --db-port "$DB_PORT_VALUE" \
    --db-name "$DB_NAME_VALUE" \
    --db-user "$DB_USER_VALUE" \
    --db-password "$DB_PASSWORD_VALUE"; then
    echo "Failed to load seed data from XLSX."
    exit 1
  fi
fi

cleanup() {
  echo
  echo "Stopping services..."
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${UI_PID:-}" ]]; then
    kill "$UI_PID" >/dev/null 2>&1 || true
  fi
  wait >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT ..."
(
  cd "$ROOT_DIR"
  exec "$PYTHON_BIN" -m uvicorn backend.app.main:app --reload --host "$BACKEND_HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "Starting UI on http://$UI_HOST:$UI_PORT ..."
(
  cd "$UI_DIR"
  exec npm run dev -- --host "$UI_HOST" --port "$UI_PORT"
) &
UI_PID=$!

echo
echo "Services started."
echo "UI:      http://localhost:$UI_PORT/"
echo "Backend: http://localhost:$BACKEND_PORT/"
echo "Press Ctrl+C to stop both."
echo

wait