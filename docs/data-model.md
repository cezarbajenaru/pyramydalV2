# Data Model

## Overview

PyramydalV2 uses a PostgreSQL database with a clear separation between:
- **Editable columns** (user-managed data)
- **Derived columns** (auto-calculated, read-only)
- **Audit columns** (system-managed timestamps/users)

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────┐
│ main_rows (75k rows)                             │
│ ─────────────────────────────────────────────── │
│ • id (PK)                                        │
│ • nr_fisa (job sheet number)                    │
│ • reper (part number) ────────┐                 │
│ • client (customer) ──────┐   │                 │
│ • buc (quantity)          │   │                 │
│ • status                  │   │                 │
│ ─────────────────────────────────────────────── │
│ DERIVED (auto-calculated):│   │                 │
│ • timp_per_buc ────────┐  │   │                 │
│ • ore_totale           │  │   │                 │
│ • valoare_per_buc ──┐  │  │   │                 │
│ • valoare_totala    │  │  │   │                 │
│ • utilaj_folosit    │  │  │   │                 │
└─────────────────────┼──┼──┼───┼─────────────────┘
                      │  │  │   │
                      │  │  │   └────────┐
                      │  │  │            │
                      │  │  │  ┌─────────▼─────────────────────┐
                      │  │  │  │ lista_programe (42k rows)     │
                      │  │  │  │ ───────────────────────────── │
                      │  │  └──┤ • reper (FK)                  │
                      │  │     │ • client (FK)                 │
                      │  │     │ • indice                      │
                      │  └─────┤ • timpi_masinare              │
                      │        │ • utilaj                      │
                      │        │ • soft_folosit                │
                      │        │ • programator                 │
                      │        │ • locatie_dosar               │
                      │        └───────────────────────────────┘
                      │
                      │        ┌───────────────────────────────┐
                      │        │ price_list                    │
                      │        │ ───────────────────────────── │
                      └────────┤ • reper (FK)                  │
                               │ • client (optional FK)        │
                               │ • pret_per_buc                │
                               │ • valabil_de_la               │
                               │ • valabil_pana_la             │
                               └───────────────────────────────┘

┌──────────────────────┐       ┌───────────────────────────────┐
│ timing_list          │       │ cnc_times                     │
│ ──────────────────── │       │ ───────────────────────────── │
│ • operatie           │       │ • masina                      │
│ • reper (optional)   │       │ • reper                       │
│ • timp_standard      │       │ • timp_ciclu                  │
└──────────────────────┘       │ • timp_setup                  │
                               └───────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ imports_audit (audit trail)                      │
│ ──────────────────────────────────────────────── │
│ • import_id (UUID)                               │
│ • import_type (lista_programe, price_list, etc.) │
│ • file_name, file_s3_key                         │
│ • status, rows_loaded, validation_errors         │
│ • started_at, completed_at                       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ recalc_runs (automation audit)                   │
│ ──────────────────────────────────────────────── │
│ • run_id (UUID)                                  │
│ • rows_updated, rows_matched, rows_unmatched     │
│ • execution_time_ms                              │
│ • triggered_by (scheduled, manual, post_import)  │
│ • started_at, completed_at                       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ user_edits (granular audit)                      │
│ ──────────────────────────────────────────────── │
│ • table_name, record_id, column_name             │
│ • old_value, new_value                           │
│ • edited_by, edited_at                           │
└──────────────────────────────────────────────────┘
```

## Table Definitions

### main_rows (Core Production Data)

**Purpose:** Tracks production jobs with mixed editable/derived columns

**Row Count:** ~75,000 active rows

**Column Classification:**

| Column | Type | Category | Source | Notes |
|--------|------|----------|--------|-------|
| `id` | BIGSERIAL | System | Auto | Primary key |
| `nr_fisa` | VARCHAR(50) | Editable | User | Job sheet number |
| `reper` | VARCHAR(100) | Editable | User | Part number (join key) |
| `client` | VARCHAR(200) | Editable | User | Customer name (join key) |
| `buc` | INTEGER | Editable | User | Quantity |
| `data_intrare` | DATE | Editable | User | Entry date |
| `data_livrare` | DATE | Editable | User | Delivery date |
| `comanda` | VARCHAR(100) | Editable | User | Order number |
| `status` | VARCHAR(50) | Editable | User | Job status |
| `observatii` | TEXT | Editable | User | Notes |
| `strung_colchester` | NUMERIC(10,2) | Editable | User | Lathe hours allocated |
| `strung_cnc` | NUMERIC(10,2) | Editable | User | CNC lathe hours |
| *(12 more machine columns)* | NUMERIC(10,2) | Editable | User | Various machines |
| **`timp_per_buc`** | NUMERIC(10,4) | **Derived** | **Recalc** | From lista_programe |
| **`ore_totale`** | NUMERIC(10,2) | **Derived** | **Recalc** | = buc × timp_per_buc |
| **`valoare_per_buc`** | NUMERIC(10,2) | **Derived** | **Recalc** | From price_list |
| **`valoare_totala`** | NUMERIC(10,2) | **Derived** | **Recalc** | = buc × valoare_per_buc |
| **`utilaj_folosit`** | VARCHAR(100) | **Derived** | **Recalc** | From lista_programe |
| **`soft_folosit`** | VARCHAR(100) | **Derived** | **Recalc** | From lista_programe |
| **`programator`** | VARCHAR(100) | **Derived** | **Recalc** | From lista_programe |
| `created_at` | TIMESTAMPTZ | Audit | Auto | Record creation |
| `created_by` | VARCHAR(100) | Audit | User | Creator email |
| `updated_at` | TIMESTAMPTZ | Audit | Auto-trigger | Last edit time |
| `updated_by` | VARCHAR(100) | Audit | User | Last editor email |
| `recalc_at` | TIMESTAMPTZ | Audit | Recalc | Last recalc time |
| `deleted_at` | TIMESTAMPTZ | System | Soft delete | NULL = active |

**Indexes:**
```sql
CREATE INDEX idx_main_rows_reper ON main_rows(reper) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_client ON main_rows(client) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_reper_client ON main_rows(reper, client) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_nr_fisa ON main_rows(nr_fisa) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_status ON main_rows(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_updated_at ON main_rows(updated_at DESC) WHERE deleted_at IS NULL;
```

**Constraints:**
- `buc > 0` (positive quantity)
- `data_livrare >= data_intrare` (delivery after entry)

---

### lista_programe (Program Library)

**Purpose:** Reference data for machining times and program details

**Row Count:** ~42,000 programs

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Primary key |
| `reper` | VARCHAR(100) | Part number (join to main_rows) |
| `client` | VARCHAR(200) | Customer name (join to main_rows) |
| `indice` | VARCHAR(50) | Version/revision (typically "-") |
| `soft_folosit` | VARCHAR(100) | Software used (PowerMill, etc.) |
| `utilaj` | VARCHAR(100) | Machine/equipment name |
| `timpi_masinare` | NUMERIC(10,4) | **Machining time (hours per piece)** |
| `programator` | VARCHAR(100) | Programmer name |
| `locatie_dosar` | VARCHAR(200) | Folder location (network path) |
| `data_programare` | DATE | Programming date |

**Unique Constraint:**
```sql
UNIQUE (reper, client, indice)
```

**Indexes:**
```sql
CREATE INDEX idx_lista_programe_reper ON lista_programe(reper);
CREATE INDEX idx_lista_programe_client ON lista_programe(client);
CREATE INDEX idx_lista_programe_reper_client ON lista_programe(reper, client);
```

**Join Logic:**
```sql
-- Used in recalc to update main_rows
SELECT timpi_masinare, utilaj, soft_folosit, programator
FROM lista_programe
WHERE reper = main_rows.reper
  AND client = main_rows.client
  AND indice = '-';  -- Use default index
```

---

### price_list (Pricing Reference)

**Purpose:** Price per piece for each part

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `reper` | VARCHAR(100) | Part number |
| `client` | VARCHAR(200) | Customer (optional, for client-specific pricing) |
| `pret_per_buc` | NUMERIC(10,2) | **Price per piece** |
| `moneda` | VARCHAR(10) | Currency (EUR, USD) |
| `valabil_de_la` | DATE | Valid from date |
| `valabil_pana_la` | DATE | Valid until date (NULL = indefinite) |

**Join Logic:**
```sql
-- Prioritize client-specific pricing, fall back to generic
SELECT pret_per_buc
FROM price_list
WHERE reper = main_rows.reper
  AND (client IS NULL OR client = main_rows.client)
  AND (valabil_pana_la IS NULL OR valabil_pana_la >= CURRENT_DATE)
ORDER BY client NULLS LAST  -- Client-specific first
LIMIT 1;
```

---

### timing_list (Standard Operation Times)

**Purpose:** Standard times for common operations

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `operatie` | VARCHAR(100) | Operation type (ajustare, filetare, etc.) |
| `reper` | VARCHAR(100) | Part number (optional, NULL = generic) |
| `timp_standard` | NUMERIC(10,4) | Standard time (hours) |

---

### cnc_times (CNC Machine Cycle Times)

**Purpose:** Machine-specific cycle times

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `masina` | VARCHAR(100) | Machine name |
| `reper` | VARCHAR(100) | Part number |
| `timp_ciclu` | NUMERIC(10,4) | Cycle time (hours) |
| `timp_setup` | NUMERIC(10,4) | Setup time (hours) |

**Unique Constraint:**
```sql
UNIQUE (masina, reper)
```

---

## Staging Tables

Purpose: Safe import zones for XLSX validation before going live

- `staging_lista_programe`
- `staging_price_list`
- `staging_timing_list`
- `staging_cnc_times`

**Pattern:**
1. TRUNCATE staging table
2. INSERT rows from XLSX
3. Run validation (SQL function)
4. If valid: atomically swap to live table
5. If invalid: report errors, rollback

---

## Audit Tables

### imports_audit

**Purpose:** Complete audit trail of XLSX imports

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `import_id` | UUID | Unique import identifier |
| `import_type` | VARCHAR(50) | lista_programe, price_list, etc. |
| `file_name` | VARCHAR(500) | Original filename |
| `file_s3_key` | VARCHAR(1000) | S3 object key |
| `status` | VARCHAR(50) | pending, success, failed |
| `rows_loaded` | INTEGER | Rows successfully loaded |
| `rows_rejected` | INTEGER | Rows that failed validation |
| `validation_errors` | JSONB | Array of error messages |
| `started_at` | TIMESTAMPTZ | Import start time |
| `completed_at` | TIMESTAMPTZ | Import completion time |

**Example Error JSON:**
```json
[
  {
    "row": 145,
    "errors": ["Missing required field: reper", "Invalid numeric value in timpi_masinare"]
  },
  {
    "row": 278,
    "errors": ["Duplicate key: reper=ABC123, client=XYZ Corp"]
  }
]
```

---

### recalc_runs

**Purpose:** Audit trail of automated recalculations

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `run_id` | UUID | Unique run identifier |
| `status` | VARCHAR(50) | running, success, failed |
| `rows_updated` | INTEGER | Total rows updated |
| `rows_matched` | INTEGER | Rows with matching reference data |
| `rows_unmatched` | INTEGER | Rows without matches |
| `execution_time_ms` | INTEGER | Query execution time |
| `triggered_by` | VARCHAR(50) | scheduled, manual, post_import |
| `triggered_by_user` | VARCHAR(100) | User email (if manual) |
| `unmatched_keys` | JSONB | Sample of unmatched reper+client |

**Example Unmatched Keys JSON:**
```json
[
  {"reper": "PART123", "client": "ABC Corp", "nr_fisa": "319083"},
  {"reper": "PART456", "client": "XYZ Inc", "nr_fisa": "320145"}
]
```

---

### user_edits

**Purpose:** Granular cell-level edit tracking

**Key Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `table_name` | VARCHAR(100) | Table that was edited |
| `record_id` | BIGINT | Row ID |
| `column_name` | VARCHAR(100) | Column that changed |
| `old_value` | TEXT | Previous value |
| `new_value` | TEXT | New value |
| `edited_by` | VARCHAR(100) | User email |
| `edited_at` | TIMESTAMPTZ | Edit timestamp |

**Example Query:**
```sql
-- Get edit history for a specific job
SELECT column_name, old_value, new_value, edited_by, edited_at
FROM user_edits
WHERE table_name = 'main_rows'
  AND record_id = 12345
ORDER BY edited_at DESC;
```

---

## Join Key Strategy

### Primary Join: main_rows ↔ lista_programe

```sql
ON main_rows.reper = lista_programe.reper
AND main_rows.client = lista_programe.client
AND lista_programe.indice = '-'
```

**Considerations:**
- `reper` and `client` must match exactly (case-sensitive)
- If keys don't match: row remains unmatched, derived columns stay NULL
- Unmatched keys logged in `recalc_runs.unmatched_keys`

**Data Quality Requirements:**
- Consistent spelling (e.g., "ABC Corp" vs "ABC Corporation")
- Trim whitespace
- Normalize case if necessary

**If Keys Are Inconsistent:**
- Option 1: Create `client_mapping` table for aliases
- Option 2: Normalize keys during import (Python pre-processing)
- Option 3: Manual data cleanup before go-live

---

## Data Lifecycle

### Insert New Job

```sql
INSERT INTO main_rows (nr_fisa, reper, client, buc, created_by)
VALUES ('320001', 'PART123', 'ABC Corp', 50, 'user@example.com');

-- Derived columns initially NULL
-- Next recalc (within 15 min) will populate them
```

### Edit Job

```sql
UPDATE main_rows
SET buc = 100, updated_by = 'user@example.com'
WHERE id = 12345;

-- Audit logged in user_edits
-- Recalc will update: ore_totale = 100 * timp_per_buc
```

### Soft Delete

```sql
UPDATE main_rows
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 12345;

-- Row excluded from queries via: WHERE deleted_at IS NULL
-- Physical row retained for audit purposes
```

---

## Migration from Excel

### Initial Data Load

```python
# Python script to load existing Excel data

import pandas as pd
import psycopg2

# Read Excel
df = pd.read_excel('normare_utilaje_2024.xlsx', sheet_name='PAGINA PRINCIPALA')

# Map columns
column_mapping = {
    'NR FISA': 'nr_fisa',
    'Reper': 'reper',
    'Client': 'client',
    'Buc.': 'buc',
    'Timp//buc': 'timp_per_buc',  # Will become derived later
    # ... map all columns
}

df = df.rename(columns=column_mapping)

# Clean data
df['reper'] = df['reper'].str.strip()
df['client'] = df['client'].str.strip()

# Insert to PostgreSQL
conn = psycopg2.connect(...)
cursor = conn.cursor()

for _, row in df.iterrows():
    cursor.execute("""
        INSERT INTO app.main_rows (nr_fisa, reper, client, buc, created_by)
        VALUES (%s, %s, %s, %s, 'migration')
    """, (row['nr_fisa'], row['reper'], row['client'], row['buc']))

conn.commit()
```

---

## Performance Considerations

### Query Optimization

**Good:**
```sql
-- Uses index on reper+client
SELECT * FROM main_rows
WHERE reper = 'PART123' AND client = 'ABC Corp' AND deleted_at IS NULL;
```

**Bad:**
```sql
-- Full table scan (LIKE without prefix)
SELECT * FROM main_rows
WHERE reper LIKE '%123%';
```

### Recalc Performance

**Current:** 75k rows update in ~10-20 seconds  
**Target:** < 30 seconds for 100k rows

**Optimization:**
- All join keys indexed
- SET-based UPDATE (not row-by-row)
- `WHERE deleted_at IS NULL` reduces working set

---

## Data Integrity Rules

1. **Editable columns:** Only modified by user actions (Appsmith UI)
2. **Derived columns:** Only modified by recalc Lambda (never manual edits)
3. **Audit columns:** Only modified by system triggers
4. **Soft deletes:** Never hard delete (set deleted_at instead)
5. **Foreign keys:** Joins are logical (not enforced FK constraints for flexibility)

