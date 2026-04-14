import json
import uuid
from datetime import date, datetime

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
    data_intrare: date | None = None
    data_livrare: date | None = None
    comanda: str | None = Field(default=None, max_length=100)
    tratament: str | None = Field(default=None, max_length=200)
    observatii: str | None = None
    strung_colchester: float | None = Field(default=None, ge=0)
    strung_cnc: float | None = Field(default=None, ge=0)
    freze_mici: float | None = Field(default=None, ge=0)
    freze_mari: float | None = Field(default=None, ge=0)
    gaurire: float | None = Field(default=None, ge=0)
    rectificare: float | None = Field(default=None, ge=0)
    bwk: float | None = Field(default=None, ge=0)
    sip: float | None = Field(default=None, ge=0)
    norte: float | None = Field(default=None, ge=0)
    tos: float | None = Field(default=None, ge=0)
    bridgeport: float | None = Field(default=None, ge=0)
    eco: float | None = Field(default=None, ge=0)
    schaublin: float | None = Field(default=None, ge=0)
    hurco: float | None = Field(default=None, ge=0)
    matec: float | None = Field(default=None, ge=0)
    parpas: float | None = Field(default=None, ge=0)
    ajustare: float | None = Field(default=None, ge=0)
    filetare: float | None = Field(default=None, ge=0)
    marcare: float | None = Field(default=None, ge=0)
    curatare_filete: float | None = Field(default=None, ge=0)
    timp_per_buc: float | None = Field(default=None, ge=0)
    ore_totale: float | None = Field(default=None, ge=0)
    valoare_per_buc: float | None = Field(default=None, ge=0)
    valoare_totala: float | None = Field(default=None, ge=0)
    utilaj_folosit: str | None = Field(default=None, max_length=100)
    soft_folosit: str | None = Field(default=None, max_length=100)
    programator: str | None = Field(default=None, max_length=100)
    locatie_dosar: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, max_length=50)
    control_status: str | None = Field(default=None, max_length=50)
    magazie_status: str | None = Field(default=None, max_length=50)
    created_by: str | None = Field(default=None, max_length=100)
    updated_by: str | None = Field(default=None, max_length=100)
    recalc_at: datetime | None = None


class CreateMainRowRequest(BaseModel):
    nr_fisa: str = Field(min_length=1, max_length=50)
    reper: str = Field(min_length=1, max_length=100)
    client: str = Field(min_length=1, max_length=200)
    buc: float = Field(ge=0)
    data_intrare: date | None = None
    data_livrare: date | None = None
    comanda: str | None = Field(default=None, max_length=100)
    tratament: str | None = Field(default=None, max_length=200)
    observatii: str | None = None
    strung_colchester: float | None = Field(default=None, ge=0)
    strung_cnc: float | None = Field(default=None, ge=0)
    freze_mici: float | None = Field(default=None, ge=0)
    freze_mari: float | None = Field(default=None, ge=0)
    gaurire: float | None = Field(default=None, ge=0)
    rectificare: float | None = Field(default=None, ge=0)
    bwk: float | None = Field(default=None, ge=0)
    sip: float | None = Field(default=None, ge=0)
    norte: float | None = Field(default=None, ge=0)
    tos: float | None = Field(default=None, ge=0)
    bridgeport: float | None = Field(default=None, ge=0)
    eco: float | None = Field(default=None, ge=0)
    schaublin: float | None = Field(default=None, ge=0)
    hurco: float | None = Field(default=None, ge=0)
    matec: float | None = Field(default=None, ge=0)
    parpas: float | None = Field(default=None, ge=0)
    ajustare: float | None = Field(default=None, ge=0)
    filetare: float | None = Field(default=None, ge=0)
    marcare: float | None = Field(default=None, ge=0)
    curatare_filete: float | None = Field(default=None, ge=0)
    status: str | None = Field(default="in_lucru", max_length=50)
    control_status: str | None = Field(default=None, max_length=50)
    magazie_status: str | None = Field(default=None, max_length=50)


class TriggerRecalcRequest(BaseModel):
    triggered_by: str = "manual"
    triggered_by_user: str | None = None


SELECT_MAIN_ROW_COLUMNS = [
    "id",
    "nr_fisa",
    "reper",
    "client",
    "buc",
    "data_intrare",
    "data_livrare",
    "comanda",
    "tratament",
    "observatii",
    "strung_colchester",
    "strung_cnc",
    "freze_mici",
    "freze_mari",
    "gaurire",
    "rectificare",
    "bwk",
    "sip",
    "norte",
    "tos",
    "bridgeport",
    "eco",
    "schaublin",
    "hurco",
    "matec",
    "parpas",
    "ajustare",
    "filetare",
    "marcare",
    "curatare_filete",
    "timp_per_buc",
    "ore_totale",
    "valoare_per_buc",
    "valoare_totala",
    "utilaj_folosit",
    "soft_folosit",
    "programator",
    "locatie_dosar",
    "status",
    "control_status",
    "magazie_status",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "recalc_at",
]

EDITABLE_MAIN_ROW_FIELDS = {
    "nr_fisa",
    "reper",
    "client",
    "buc",
    "data_intrare",
    "data_livrare",
    "comanda",
    "tratament",
    "observatii",
    "strung_colchester",
    "strung_cnc",
    "freze_mici",
    "freze_mari",
    "gaurire",
    "rectificare",
    "bwk",
    "sip",
    "norte",
    "tos",
    "bridgeport",
    "eco",
    "schaublin",
    "hurco",
    "matec",
    "parpas",
    "ajustare",
    "filetare",
    "marcare",
    "curatare_filete",
    "timp_per_buc",
    "ore_totale",
    "valoare_per_buc",
    "valoare_totala",
    "utilaj_folosit",
    "soft_folosit",
    "programator",
    "locatie_dosar",
    "status",
    "control_status",
    "magazie_status",
    "created_by",
    "updated_by",
    "recalc_at",
}


def serialize_main_row(row: tuple[object, ...]) -> dict[str, object | None]:
    payload: dict[str, object | None] = {}
    for index, column in enumerate(SELECT_MAIN_ROW_COLUMNS):
        value = row[index]
        if isinstance(value, datetime):
            payload[column] = value.isoformat()
        elif isinstance(value, date):
            payload[column] = value.isoformat()
        elif isinstance(value, (int, float)):
            payload[column] = float(value)
        else:
            payload[column] = value
    return payload


def validate_main_row_dates(payload: UpdateMainRowRequest | CreateMainRowRequest):
    if payload.data_intrare and payload.data_livrare and payload.data_livrare < payload.data_intrare:
        raise HTTPException(status_code=400, detail="data_livrare must be >= data_intrare")


@app.get("/health")
def health():
    return {"ok": True, "ts": datetime.utcnow().isoformat()}


@app.get("/api/main-rows")
def list_main_rows(page: int = 1, page_size: int = 20):
    offset = (page - 1) * page_size
    with db_cursor() as (_, cur):
        cur.execute(
            f"""
            SELECT {", ".join(SELECT_MAIN_ROW_COLUMNS)}
            FROM app.main_rows
            WHERE deleted_at IS NULL
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            (page_size, offset),
        )
        rows = cur.fetchall()

    return {"rows": [serialize_main_row(row) for row in rows]}


@app.get("/api/main-rows/{row_id}")
def get_main_row(row_id: int):
    with db_cursor() as (_, cur):
        cur.execute(
            f"""
            SELECT {", ".join(SELECT_MAIN_ROW_COLUMNS)}
            FROM app.main_rows
            WHERE id = %s AND deleted_at IS NULL
            """,
            (row_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    return {"row": serialize_main_row(row)}


@app.get("/api/main-rows-search")
def search_main_rows(query: str, limit: int = 100):
    safe_limit = max(1, min(limit, 500))
    q = query.strip()
    if not q:
        return {"rows": []}
    like_query = f"%{q}%"
    with db_cursor() as (_, cur):
        cur.execute(
            f"""
            SELECT {", ".join(SELECT_MAIN_ROW_COLUMNS)}
            FROM app.main_rows
            WHERE deleted_at IS NULL
              AND (
                CAST(id AS TEXT) ILIKE %s
                OR nr_fisa ILIKE %s
                OR reper ILIKE %s
                OR client ILIKE %s
              )
            ORDER BY id DESC
            LIMIT %s
            """,
            (like_query, like_query, like_query, like_query, safe_limit),
        )
        rows = cur.fetchall()
    return {"rows": [serialize_main_row(row) for row in rows]}


@app.patch("/api/main-rows/{row_id}")
def patch_main_row(row_id: int, payload: UpdateMainRowRequest):
    validate_main_row_dates(payload)
    updates: list[str] = []
    values: list[object] = []
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in EDITABLE_MAIN_ROW_FIELDS:
            updates.append(f"{key} = %s")
            values.append(value)

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
    validate_main_row_dates(payload)
    body = payload.model_dump()
    insert_columns = [key for key in body.keys() if key in EDITABLE_MAIN_ROW_FIELDS]
    insert_values = [body[column] for column in insert_columns]
    insert_columns.extend(["ore_totale", "created_by", "updated_by"])
    insert_values.extend([0, "ui-api", "ui-api"])
    placeholders = ", ".join(["%s"] * len(insert_columns))

    with db_cursor() as (conn, cur):
        cur.execute(
            f"""
            INSERT INTO app.main_rows ({", ".join(insert_columns)})
            VALUES ({placeholders})
            RETURNING {", ".join(SELECT_MAIN_ROW_COLUMNS)}
            """,
            tuple(insert_values),
        )
        row = cur.fetchone()
        conn.commit()

    return {"row": serialize_main_row(row)}


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
