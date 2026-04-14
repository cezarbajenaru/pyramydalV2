import json
import uuid
from datetime import datetime

import boto3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import settings
from .db import db_cursor

app = FastAPI(title="Pyramydal Backend API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lambda_client = boto3.client(
    "lambda",
    region_name=settings.aws_region,
    endpoint_url=settings.aws_endpoint_url,
)


class UpdateMainRowRequest(BaseModel):
    nr_fisa: str | None = Field(default=None, min_length=1, max_length=50)
    reper: str | None = Field(default=None, min_length=1, max_length=100)
    client: str | None = Field(default=None, min_length=1, max_length=200)
    buc: float | None = Field(default=None, ge=0)


class CreateMainRowRequest(BaseModel):
    nr_fisa: str = Field(min_length=1, max_length=50)
    reper: str = Field(min_length=1, max_length=100)
    client: str = Field(min_length=1, max_length=200)
    buc: float = Field(ge=0)


class TriggerRecalcRequest(BaseModel):
    triggered_by: str = "manual"
    triggered_by_user: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


@app.get("/api/main-rows")
def list_main_rows(page: int = 1, page_size: int = 20):
    offset = (page - 1) * page_size
    with db_cursor() as (_, cur):
        cur.execute(
            """
            SELECT id, nr_fisa, reper, client, buc, timp_per_buc, ore_totale, updated_at
            FROM app.main_rows
            WHERE deleted_at IS NULL
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            (page_size, offset),
        )
        rows = cur.fetchall()

    return {
        "rows": [
            {
                "id": row[0],
                "nr_fisa": row[1],
                "reper": row[2],
                "client": row[3],
                "buc": float(row[4]) if row[4] is not None else 0.0,
                "timp_per_buc": float(row[5]) if row[5] is not None else 0.0,
                "ore_totale": float(row[6]) if row[6] is not None else 0.0,
                "updated_at": row[7].isoformat() if row[7] else datetime.utcnow().isoformat(),
            }
            for row in rows
        ]
    }


@app.patch("/api/main-rows/{row_id}")
def patch_main_row(row_id: int, payload: UpdateMainRowRequest):
    updates: list[str] = []
    values: list[object] = []

    if payload.nr_fisa is not None:
        updates.append("nr_fisa = %s")
        values.append(payload.nr_fisa)
    if payload.reper is not None:
        updates.append("reper = %s")
        values.append(payload.reper)
    if payload.client is not None:
        updates.append("client = %s")
        values.append(payload.client)
    if payload.buc is not None:
        updates.append("buc = %s")
        values.append(payload.buc)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided")

    updates.append("updated_by = %s")
    values.append("ui-api")
    values.append(row_id)

    with db_cursor() as (conn, cur):
        cur.execute(
            f"""
            UPDATE app.main_rows
            SET {", ".join(updates)}
            WHERE id = %s AND deleted_at IS NULL
            """,
            tuple(values),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Row not found")
        conn.commit()

    return {"ok": True, "row_id": row_id}


@app.post("/api/main-rows")
def create_main_row(payload: CreateMainRowRequest):
    with db_cursor() as (conn, cur):
        cur.execute(
            """
            INSERT INTO app.main_rows (nr_fisa, reper, client, buc, ore_totale, created_by, updated_by)
            VALUES (%s, %s, %s, %s, 0, %s, %s)
            RETURNING id, nr_fisa, reper, client, buc, timp_per_buc, ore_totale, updated_at
            """,
            (payload.nr_fisa, payload.reper, payload.client, payload.buc, "ui-api", "ui-api"),
        )
        row = cur.fetchone()
        conn.commit()

    return {
        "row": {
            "id": row[0],
            "nr_fisa": row[1],
            "reper": row[2],
            "client": row[3],
            "buc": float(row[4]) if row[4] is not None else 0.0,
            "timp_per_buc": float(row[5]) if row[5] is not None else 0.0,
            "ore_totale": float(row[6]) if row[6] is not None else 0.0,
            "updated_at": row[7].isoformat() if row[7] else datetime.utcnow().isoformat(),
        }
    }


@app.delete("/api/main-rows/{row_id}")
def delete_main_row(row_id: int):
    with db_cursor() as (conn, cur):
        cur.execute(
            """
            UPDATE app.main_rows
            SET deleted_at = CURRENT_TIMESTAMP, updated_by = %s
            WHERE id = %s AND deleted_at IS NULL
            """,
            ("ui-api", row_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Row not found")
        conn.commit()
    return {"ok": True, "row_id": row_id}


@app.get("/api/recalc/status")
def recalc_status():
    with db_cursor() as (_, cur):
        cur.execute(
            """
            SELECT status, started_at, execution_time_ms, rows_updated
            FROM app.recalc_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
    if not row:
        return {"status": "No recalc run found yet"}
    return {
        "status": f"{row[0]} | rows_updated={row[3] or 0} | duration_ms={row[2] or 0} | started_at={row[1].isoformat()}"
    }


@app.post("/api/recalc/run")
def run_recalc(payload: TriggerRecalcRequest):
    request_payload = {
        "triggered_by": payload.triggered_by,
        "triggered_by_user": payload.triggered_by_user or "ui-api",
    }

    try:
        response = lambda_client.invoke(
            FunctionName=settings.recalc_lambda_name,
            InvocationType="RequestResponse",
            Payload=json.dumps(request_payload).encode("utf-8"),
        )
        raw = response["Payload"].read().decode("utf-8")
        body = json.loads(raw) if raw else {}
        return {"ok": True, "lambda_response": body}
    except Exception:
        run_id = fallback_recalc_sql(payload.triggered_by, payload.triggered_by_user or "ui-api")
        return {"ok": True, "fallback": "stored_procedure", "run_id": run_id}


def fallback_recalc_sql(triggered_by: str, triggered_by_user: str) -> str:
    run_id = str(uuid.uuid4())
    with db_cursor() as (conn, cur):
        cur.execute(
            """
            INSERT INTO app.recalc_runs (run_id, status, triggered_by, triggered_by_user, started_at)
            VALUES (%s, 'running', %s, %s, CURRENT_TIMESTAMP)
            """,
            (run_id, triggered_by, triggered_by_user),
        )

        cur.execute(
            """
            UPDATE app.main_rows m
            SET
              timp_per_buc = lp.timpi_masinare,
              ore_totale = COALESCE(m.buc * lp.timpi_masinare, 0),
              utilaj_folosit = lp.utilaj,
              soft_folosit = lp.soft_folosit,
              programator = lp.programator,
              locatie_dosar = lp.locatie_dosar,
              recalc_at = CURRENT_TIMESTAMP
            FROM app.lista_programe lp
            WHERE m.reper = lp.reper
              AND m.client = lp.client
              AND m.deleted_at IS NULL
              AND lp.indice = '-'
            """
        )
        rows_timp = cur.rowcount

        cur.execute(
            """
            UPDATE app.main_rows m
            SET
              valoare_per_buc = pl.pret_per_buc,
              valoare_totala = COALESCE(m.buc * pl.pret_per_buc, 0),
              recalc_at = CURRENT_TIMESTAMP
            FROM app.price_list pl
            WHERE m.reper = pl.reper
              AND (pl.client IS NULL OR pl.client = m.client)
              AND m.deleted_at IS NULL
              AND (pl.valabil_pana_la IS NULL OR pl.valabil_pana_la >= CURRENT_DATE)
            """
        )
        rows_price = cur.rowcount

        cur.execute(
            """
            SELECT COUNT(*)
            FROM app.main_rows
            WHERE deleted_at IS NULL AND recalc_at IS NOT NULL
            """
        )
        rows_matched = cur.fetchone()[0]

        cur.execute(
            """
            SELECT COUNT(*)
            FROM app.main_rows
            WHERE deleted_at IS NULL
            """
        )
        total_rows = cur.fetchone()[0]

        cur.execute(
            """
            UPDATE app.recalc_runs
            SET
              completed_at = CURRENT_TIMESTAMP,
              status = 'success',
              rows_updated = %s,
              rows_matched = %s,
              rows_unmatched = %s
            WHERE run_id = %s
            """,
            (rows_timp + rows_price, rows_matched, total_rows - rows_matched, run_id),
        )
        conn.commit()
    return run_id
