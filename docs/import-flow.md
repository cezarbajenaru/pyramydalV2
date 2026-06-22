# XLSX Import Flow

> **Consolidated guide:** [GUIDE.md](GUIDE.md). This file is extended reference.

## Overview

The import pipeline safely loads reference data from Excel files into PostgreSQL, with validation and rollback capability.

## Design Principles

1. **Staging before production:** Load to staging table first, validate, then swap
2. **Atomic swaps:** All-or-nothing updates (no partial imports)
3. **Validation before commit:** Catch errors before affecting live data
4. **Full audit trail:** Track every import attempt (success and failure)
5. **Idempotent:** Can re-run same file safely

## Architecture

```
┌──────────────┐
│ User uploads │
│ XLSX via UI  │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Step 1: Upload to S3                    │
│ - uploads/lista_programe/file.xlsx      │
│ - Versioning enabled (rollback)         │
└──────┬──────────────────────────────────┘
       │ Trigger
       ▼
┌─────────────────────────────────────────┐
│ Step 2: Lambda Invocation               │
│ {                                        │
│   "s3_key": "uploads/.../file.xlsx",    │
│   "import_type": "lista_programe",      │
│   "uploaded_by": "user@example.com"     │
│ }                                        │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Step 3: Initialize Audit Record         │
│ INSERT INTO imports_audit               │
│ (import_id, status='pending')           │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Step 4: Download from S3                │
│ - boto3.get_object()                    │
│ - Read into memory (BytesIO)            │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Step 5: Parse XLSX                      │
│ - openpyxl (read_only=True)             │
│ - Extract headers from row 1            │
│ - Map to DB column names                │
│ - Parse data rows (skip empties)        │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Step 6: Python Validation               │
│ - Required columns present?             │
│ - Required fields not null?             │
│ - Data types valid?                     │
│ - Duplicate keys?                       │
└──────┬──────────────────────────────────┘
       │ IF ERRORS
       ├────────────────────┐
       │ NO ERRORS          │ ERRORS FOUND
       ▼                    ▼
┌─────────────────┐    ┌────────────────────┐
│ Step 7a:        │    │ Step 7b:           │
│ Load to Staging │    │ Log Errors & Fail  │
│                 │    │ - Update audit     │
│ TRUNCATE        │    │ - Return errors    │
│ staging table   │    │ - Exit             │
│                 │    └────────────────────┘
│ INSERT rows     │
│ from XLSX       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Step 8: SQL Validation                  │
│ - Call validate_staging_lista_programe()│
│ - Check duplicates (SQL GROUP BY)       │
│ - Check constraints                     │
│ - Check negative values                 │
└──────┬──────────────────────────────────┘
       │ IF ERRORS
       ├────────────────────┐
       │ NO ERRORS          │ ERRORS FOUND
       ▼                    ▼
┌─────────────────┐    ┌────────────────────┐
│ Step 9a:        │    │ Step 9b:           │
│ Swap to Live    │    │ Log Errors & Fail  │
│                 │    └────────────────────┘
│ BEGIN;          │
│ TRUNCATE live;  │
│ INSERT...SELECT │
│ FROM staging;   │
│ COMMIT;         │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ Step 10: Update Audit (Success)         │
│ - status='success'                      │
│ - rows_loaded=N                         │
│ - completed_at=NOW()                    │
└──────┬──────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────┐
│ Step 11: Return Success to UI           │
│ {                                        │
│   "success": true,                      │
│   "import_id": "uuid",                  │
│   "rows_loaded": 42000                  │
│ }                                        │
└─────────────────────────────────────────┘
```

## XLSX File Conventions

### Expected Structure

**Sheet Selection:**
- If `sheet_name` provided in event: use that sheet
- Otherwise: use first sheet (ws.active)

**Header Row:**
- Row 1 contains column headers
- Headers case-insensitive (normalized to lowercase)
- Extra spaces/newlines stripped

**Data Rows:**
- Start from row 2
- Empty rows skipped
- Row number tracked for error reporting

### Required Headers by Import Type

#### lista_programe

| Excel Header | DB Column | Required | Type |
|--------------|-----------|----------|------|
| `CLIENT` | client | ✅ Yes | text |
| `REPER` | reper | ✅ Yes | text |
| `INDICE` | indice | No | text |
| `SOFT FOLOSIT` | soft_folosit | No | text |
| `UTILAJ` | utilaj | No | text |
| `DATA` | data_programare | No | date |
| `PROGRAMATOR` | programator | No | text |
| `OBSERVATII` | observatii | No | text |
| `LOCATIE DOSAR` | locatie_dosar | No | text |
| `TIMPI MASINARE` | timpi_masinare | No | numeric |

**Example Row:**
```
CLIENT: "ABC Corp"
REPER: "PART123"
INDICE: "-"
SOFT FOLOSIT: "PowerMill"
UTILAJ: "SCHAUBLIN"
TIMPI MASINARE: 0.5
```

#### price_list

| Excel Header | DB Column | Required | Type |
|--------------|-----------|----------|------|
| `REPER` | reper | ✅ Yes | text |
| `CLIENT` | client | No | text |
| `PRET_PER_BUC` | pret_per_buc | ✅ Yes | numeric |
| `MONEDA` | moneda | No | text (default: EUR) |
| `VALABIL_DE_LA` | valabil_de_la | No | date |
| `VALABIL_PANA_LA` | valabil_pana_la | No | date |

#### timing_list

| Excel Header | DB Column | Required | Type |
|--------------|-----------|----------|------|
| `OPERATIE` | operatie | ✅ Yes | text |
| `REPER` | reper | No | text |
| `TIMP_STANDARD` | timp_standard | ✅ Yes | numeric |
| `DESCRIERE` | descriere | No | text |

#### cnc_times

| Excel Header | DB Column | Required | Type |
|--------------|-----------|----------|------|
| `MASINA` | masina | ✅ Yes | text |
| `REPER` | reper | ✅ Yes | text |
| `TIMP_CICLU` | timp_ciclu | ✅ Yes | numeric |
| `TIMP_SETUP` | timp_setup | No | numeric |
| `OBSERVATII` | observatii | No | text |

## Validation Rules

### Python Validation (Pre-Load)

```python
def validate_data(data: List[Dict], import_type: str) -> List[Dict]:
    errors = []
    
    # 1. Required field check
    for row in data:
        if not row.get('reper'):
            errors.append({'row': row['_source_row'], 'error': 'Missing reper'})
    
    # 2. Data type check
    for row in data:
        if import_type == 'lista_programe':
            if row.get('timpi_masinare'):
                try:
                    float(row['timpi_masinare'])
                except ValueError:
                    errors.append({'row': row['_source_row'], 'error': 'Invalid timpi_masinare'})
    
    # 3. Duplicate key check
    keys_seen = set()
    for row in data:
        key = (row.get('reper'), row.get('client'), row.get('indice', '-'))
        if key in keys_seen:
            errors.append({'row': row['_source_row'], 'error': f'Duplicate key: {key}'})
        keys_seen.add(key)
    
    return errors
```

### SQL Validation (Post-Load to Staging)

```sql
CREATE OR REPLACE FUNCTION validate_staging_lista_programe()
RETURNS JSONB AS $$
DECLARE
    v_errors JSONB := '[]'::JSONB;
    v_count INTEGER;
BEGIN
    -- Empty check
    SELECT COUNT(*) INTO v_count FROM staging_lista_programe;
    IF v_count = 0 THEN
        v_errors := v_errors || jsonb_build_object('error', 'empty_staging');
    END IF;
    
    -- NULL required columns
    SELECT COUNT(*) INTO v_count
    FROM staging_lista_programe
    WHERE reper IS NULL OR client IS NULL;
    IF v_count > 0 THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'null_required_columns',
            'count', v_count
        );
    END IF;
    
    -- Duplicate keys
    SELECT COUNT(*) INTO v_count
    FROM (
        SELECT reper, client, indice
        FROM staging_lista_programe
        GROUP BY reper, client, indice
        HAVING COUNT(*) > 1
    ) dups;
    IF v_count > 0 THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'duplicate_keys',
            'count', v_count
        );
    END IF;
    
    -- Negative values
    SELECT COUNT(*) INTO v_count
    FROM staging_lista_programe
    WHERE timpi_masinare < 0;
    IF v_count > 0 THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'negative_times',
            'count', v_count
        );
    END IF;
    
    RETURN v_errors;
END;
$$ LANGUAGE plpgsql;
```

## Error Handling

### Common Errors and Solutions

#### Error: "Missing required columns"

**Cause:** Excel header names don't match expected format

**Solution:**
```python
# Add flexible header mapping
header_variations = {
    'CLIENT': ['CLIENT', 'Client', 'CUSTOMER', 'Cust'],
    'REPER': ['REPER', 'Reper', 'PART', 'Part No', 'PartNo'],
}
```

#### Error: "Duplicate key: reper=X, client=Y"

**Cause:** Same part+client combination appears multiple times

**Solution:**
- Option 1: Keep only the last occurrence (dedup in Python)
- Option 2: Reject import and ask user to fix Excel file
- Option 3: Use UPSERT instead of INSERT (ON CONFLICT DO UPDATE)

**Implementation:**
```sql
-- Option 3: Upsert pattern
INSERT INTO lista_programe (reper, client, indice, timpi_masinare, ...)
VALUES (...)
ON CONFLICT (reper, client, indice)
DO UPDATE SET
    timpi_masinare = EXCLUDED.timpi_masinare,
    updated_at = CURRENT_TIMESTAMP;
```

#### Error: "Invalid numeric value"

**Cause:** Non-numeric value in numeric column (e.g., "N/A", "-", "TBD")

**Solution:**
```python
def safe_float(value):
    if value in [None, '', '-', 'N/A', 'TBD']:
        return None
    try:
        return float(value)
    except ValueError:
        return None
```

#### Error: "Date parsing failed"

**Cause:** Various date formats (DD/MM/YYYY vs YYYY-MM-DD)

**Solution:**
```python
from dateutil import parser

def safe_date(value):
    if not value:
        return None
    try:
        return parser.parse(str(value)).date()
    except:
        return None
```

## Atomic Swap Strategy

### Pattern 1: Truncate + Insert (Current)

```sql
CREATE OR REPLACE PROCEDURE swap_staging_to_live(
    p_table_name VARCHAR,
    p_import_id UUID
) AS $$
BEGIN
    -- All within one transaction
    EXECUTE format('BEGIN');
    
    -- Truncate live table
    EXECUTE format('TRUNCATE TABLE app.%s', p_table_name);
    
    -- Copy from staging
    EXECUTE format(
        'INSERT INTO app.%s SELECT * FROM app.staging_%s',
        p_table_name, p_table_name
    );
    
    -- Update audit
    UPDATE imports_audit
    SET status = 'success', completed_at = CURRENT_TIMESTAMP
    WHERE import_id = p_import_id;
    
    EXECUTE format('COMMIT');
EXCEPTION
    WHEN OTHERS THEN
        EXECUTE format('ROLLBACK');
        UPDATE imports_audit
        SET status = 'failed', error_message = SQLERRM
        WHERE import_id = p_import_id;
        RAISE;
END;
$$ LANGUAGE plpgsql;
```

**Pros:**
- Simple
- Fast
- Minimal locking

**Cons:**
- Brief moment where table is empty (between TRUNCATE and INSERT)
- Queries during swap may return 0 rows

### Pattern 2: Rename Swap (Zero Downtime)

```sql
-- Alternative: swap via table rename (more complex)
BEGIN;
ALTER TABLE lista_programe RENAME TO lista_programe_old;
ALTER TABLE staging_lista_programe RENAME TO lista_programe;
ALTER TABLE lista_programe_old RENAME TO staging_lista_programe;
COMMIT;
```

**Pros:**
- Atomic from query perspective
- No moment where table is empty

**Cons:**
- More complex
- Requires managing constraints/indexes

**Recommendation:** Use Pattern 1 (Truncate + Insert) for simplicity. Brief empty state acceptable since recalc runs every 15 min anyway.

## Rollback Procedure

### If Bad Import Detected

```sql
-- 1. Identify bad import
SELECT import_id, file_name, started_at, rows_loaded
FROM imports_audit
WHERE import_type = 'lista_programe'
  AND status = 'success'
ORDER BY started_at DESC
LIMIT 5;

-- 2. Get previous good import S3 key
SELECT file_s3_key
FROM imports_audit
WHERE import_type = 'lista_programe'
  AND status = 'success'
  AND import_id = '<previous-good-import-id>';

-- 3. Re-run import with previous file
-- Trigger Lambda with previous S3 key
aws lambda invoke \
  --function-name pyramydal-prod-import \
  --payload '{
    "s3_key": "uploads/lista_programe/previous-file.xlsx",
    "import_type": "lista_programe",
    "uploaded_by": "admin@example.com"
  }' \
  /tmp/output.json
```

### Using S3 Versioning

```bash
# List versions of a file
aws s3api list-object-versions \
  --bucket pyramydal-prod-files \
  --prefix uploads/lista_programe/file.xlsx

# Download specific version
aws s3api get-object \
  --bucket pyramydal-prod-files \
  --key uploads/lista_programe/file.xlsx \
  --version-id <version-id> \
  /tmp/previous-version.xlsx

# Re-upload as new file
aws s3 cp /tmp/previous-version.xlsx \
  s3://pyramydal-prod-files/uploads/lista_programe/rollback-$(date +%Y%m%d).xlsx
```

## Performance Considerations

### Large Files (10k+ rows)

**Current:**
- Parse 42k rows: ~10 seconds
- Load to staging: ~5 seconds
- Validate: ~2 seconds
- Swap: ~1 second
- **Total: ~20 seconds**

**Optimization:**
```python
# Use batch inserts
cursor.executemany("""
    INSERT INTO staging_lista_programe (reper, client, ...)
    VALUES (%s, %s, ...)
""", batch_rows)
```

### Lambda Timeout

- Current: 5 minutes (300 seconds)
- Sufficient for files up to ~100k rows
- If larger files needed: increase timeout to 10 minutes

### Memory Constraints

- Current: 512 MB
- openpyxl loads entire workbook into memory
- For very large files (>50k rows): consider streaming parsers (e.g., xlsx2csv)

## Testing

### Manual Test

```python
# test_import.py
import boto3
import json

lambda_client = boto3.client('lambda')

response = lambda_client.invoke(
    FunctionName='pyramydal-prod-import',
    InvocationType='RequestResponse',
    Payload=json.dumps({
        's3_key': 'uploads/lista_programe/test-file.xlsx',
        'import_type': 'lista_programe',
        'uploaded_by': 'test@example.com'
    })
)

result = json.loads(response['Payload'].read())
print(json.dumps(result, indent=2))
```

### Integration Test

```sql
-- 1. Check staging table
SELECT COUNT(*) FROM staging_lista_programe;

-- 2. Check validation
SELECT app.validate_staging_lista_programe();

-- 3. Check swap
CALL app.swap_staging_to_live('lista_programe', 'test-uuid');

-- 4. Verify live table
SELECT COUNT(*) FROM lista_programe;

-- 5. Check audit
SELECT * FROM imports_audit ORDER BY started_at DESC LIMIT 1;
```

## Monitoring

### Key Metrics

- Import success rate (target: >95%)
- Average import time (target: <30 seconds)
- Validation error rate (target: <5%)
- File size distribution

### CloudWatch Alarms

```python
# Lambda errors
alarm = cloudwatch.MetricAlarm(
    alarm_name='pyramydal-import-errors',
    metric_name='Errors',
    namespace='AWS/Lambda',
    dimensions={'FunctionName': 'pyramydal-prod-import'},
    threshold=0,
    comparison_operator='GreaterThanThreshold',
    evaluation_periods=1,
    period=300
)
```

### Dashboard Query

```sql
-- Import success rate (last 30 days)
SELECT 
    DATE(started_at) as date,
    COUNT(*) as total_imports,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
    ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM imports_audit
WHERE started_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(started_at)
ORDER BY date DESC;
```

