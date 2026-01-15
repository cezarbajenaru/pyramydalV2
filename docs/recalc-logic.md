# Recalculation Logic

## Overview

The recalculation system automatically updates derived columns in `main_rows` based on reference data every 15 minutes using SQL UPDATE...FROM joins.

## Core Principle

**Derived columns are NEVER edited manually**. They are computed from:
- User-editable input columns (buc, reper, client)
- Reference data (lista_programe, price_list)
- SQL formulas (ore_totale = buc × timp_per_buc)

## Schedule

```
EventBridge Rule: rate(15 minutes)
    ↓
Lambda: pyramydal-prod-recalc
    ↓
PostgreSQL: CALL recalc_derived_columns()
    ↓
UPDATE main_rows FROM lista_programe
UPDATE main_rows FROM price_list
    ↓
Log results to recalc_runs table
```

## Derived Column Mapping

| Derived Column | Source | Formula |
|----------------|--------|---------|
| `timp_per_buc` | lista_programe.timpi_masinare | Direct copy via join |
| `ore_totale` | Calculated | buc × timp_per_buc |
| `valoare_per_buc` | price_list.pret_per_buc | Direct copy via join |
| `valoare_totala` | Calculated | buc × valoare_per_buc |
| `utilaj_folosit` | lista_programe.utilaj | Direct copy via join |
| `soft_folosit` | lista_programe.soft_folosit | Direct copy via join |
| `programator` | lista_programe.programator | Direct copy via join |
| `locatie_dosar` | lista_programe.locatie_dosar | Direct copy via join |

## SQL Implementation

### Main Stored Procedure

```sql
CREATE OR REPLACE PROCEDURE app.recalc_derived_columns(
    p_run_id UUID DEFAULT uuid_generate_v4(),
    p_triggered_by VARCHAR DEFAULT 'scheduled',
    p_triggered_by_user VARCHAR DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_rows_updated_timp INTEGER;
    v_rows_updated_valoare INTEGER;
    v_total_rows INTEGER;
    v_matched_rows INTEGER;
BEGIN
    v_start_time := clock_timestamp();
    
    -- Initialize run tracking
    INSERT INTO app.recalc_runs (
        run_id, status, triggered_by, triggered_by_user
    ) VALUES (
        p_run_id, 'running', p_triggered_by, p_triggered_by_user
    );
    
    -- Get total active rows
    SELECT COUNT(*) INTO v_total_rows
    FROM app.main_rows
    WHERE deleted_at IS NULL;
    
    -- ========================================================================
    -- UPDATE 1: Time-based columns from lista_programe
    -- ========================================================================
    UPDATE app.main_rows m
    SET 
        timp_per_buc = lp.timpi_masinare,
        ore_totale = COALESCE(m.buc * lp.timpi_masinare, 0),
        utilaj_folosit = lp.utilaj,
        soft_folosit = lp.soft_folosit,
        programator = lp.programator,
        locatie_dosar = lp.locatie_dosar,
        recalc_at = v_start_time
    FROM app.lista_programe lp
    WHERE m.reper = lp.reper
      AND m.client = lp.client
      AND m.deleted_at IS NULL
      AND lp.indice = '-';  -- Default version
    
    GET DIAGNOSTICS v_rows_updated_timp = ROW_COUNT;
    
    -- ========================================================================
    -- UPDATE 2: Price-based columns from price_list
    -- ========================================================================
    UPDATE app.main_rows m
    SET 
        valoare_per_buc = pl.pret_per_buc,
        valoare_totala = COALESCE(m.buc * pl.pret_per_buc, 0),
        recalc_at = v_start_time
    FROM app.price_list pl
    WHERE m.reper = pl.reper
      AND (pl.client IS NULL OR pl.client = m.client)
      AND m.deleted_at IS NULL
      AND (pl.valabil_pana_la IS NULL OR pl.valabil_pana_la >= CURRENT_DATE);
    
    GET DIAGNOSTICS v_rows_updated_valoare = ROW_COUNT;
    
    -- ========================================================================
    -- Calculate matched rows
    -- ========================================================================
    SELECT COUNT(*) INTO v_matched_rows
    FROM app.main_rows
    WHERE deleted_at IS NULL
      AND recalc_at = v_start_time;
    
    -- ========================================================================
    -- Complete run tracking
    -- ========================================================================
    v_end_time := clock_timestamp();
    
    UPDATE app.recalc_runs
    SET 
        completed_at = v_end_time,
        status = 'success',
        rows_updated = v_rows_updated_timp + v_rows_updated_valoare,
        rows_matched = v_matched_rows,
        rows_unmatched = v_total_rows - v_matched_rows,
        execution_time_ms = EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time))::INTEGER,
        timp_per_buc_updated = v_rows_updated_timp,
        valoare_per_buc_updated = v_rows_updated_valoare
    WHERE run_id = p_run_id;
    
    -- Log sample of unmatched keys
    UPDATE app.recalc_runs
    SET unmatched_keys = (
        SELECT jsonb_agg(
            jsonb_build_object(
                'reper', reper,
                'client', client,
                'nr_fisa', nr_fisa
            )
        )
        FROM (
            SELECT m.reper, m.client, m.nr_fisa
            FROM app.main_rows m
            LEFT JOIN app.lista_programe lp ON lp.reper = m.reper AND lp.client = m.client
            WHERE m.deleted_at IS NULL
              AND lp.id IS NULL
            LIMIT 50
        ) unmatched
    )
    WHERE run_id = p_run_id;
    
    COMMIT;
    
EXCEPTION
    WHEN OTHERS THEN
        UPDATE app.recalc_runs
        SET 
            completed_at = clock_timestamp(),
            status = 'failed',
            error_message = SQLERRM
        WHERE run_id = p_run_id;
        RAISE;
END;
$$;
```

## Join Logic Details

### UPDATE 1: lista_programe Join

```sql
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
WHERE m.reper = lp.reper          -- Join key 1
  AND m.client = lp.client        -- Join key 2
  AND m.deleted_at IS NULL        -- Only active rows
  AND lp.indice = '-';            -- Default version
```

**Key Points:**
- Matches on **reper + client** (case-sensitive)
- Uses `COALESCE` to handle NULL (0 instead of NULL)
- Only updates active rows (`deleted_at IS NULL`)
- `lp.indice = '-'` assumes default version (adjust if multiple versions exist)

**If No Match:**
- Row is skipped (derived columns remain as-is or NULL)
- Logged in `recalc_runs.unmatched_keys`

### UPDATE 2: price_list Join

```sql
UPDATE app.main_rows m
SET 
    valoare_per_buc = pl.pret_per_buc,
    valoare_totala = COALESCE(m.buc * pl.pret_per_buc, 0),
    recalc_at = CURRENT_TIMESTAMP
FROM app.price_list pl
WHERE m.reper = pl.reper                                     -- Join key 1
  AND (pl.client IS NULL OR pl.client = m.client)            -- Client-specific OR generic
  AND m.deleted_at IS NULL                                    -- Only active rows
  AND (pl.valabil_pana_la IS NULL OR pl.valabil_pana_la >= CURRENT_DATE);  -- Valid price
```

**Key Points:**
- Matches on **reper** (required)
- Optional **client** match (supports generic pricing)
- Filters by date validity (`valabil_pana_la`)
- Prioritizes client-specific pricing (if multiple matches, last one wins)

**To Prioritize Client-Specific Pricing:**
```sql
-- Alternative: Use DISTINCT ON for deterministic selection
UPDATE app.main_rows m
SET valoare_per_buc = sub.pret_per_buc
FROM (
    SELECT DISTINCT ON (reper, COALESCE(client, ''))
        reper, client, pret_per_buc
    FROM app.price_list
    WHERE valabil_pana_la IS NULL OR valabil_pana_la >= CURRENT_DATE
    ORDER BY reper, COALESCE(client, ''), client NULLS LAST  -- Client-specific first
) sub
WHERE m.reper = sub.reper
  AND (sub.client IS NULL OR sub.client = m.client);
```

## Performance Optimization

### Index Requirements (CRITICAL)

```sql
-- main_rows indexes
CREATE INDEX idx_main_rows_reper ON main_rows(reper) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_client ON main_rows(client) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_reper_client ON main_rows(reper, client) WHERE deleted_at IS NULL;

-- lista_programe indexes
CREATE INDEX idx_lista_programe_reper_client ON lista_programe(reper, client);

-- price_list indexes
CREATE INDEX idx_price_list_reper ON price_list(reper);
CREATE INDEX idx_price_list_reper_client ON price_list(reper, client);
CREATE INDEX idx_price_list_valid ON price_list(valabil_de_la, valabil_pana_la);
```

### Query Execution Plan

```sql
-- Check execution plan
EXPLAIN ANALYZE
UPDATE app.main_rows m
SET timp_per_buc = lp.timpi_masinare
FROM app.lista_programe lp
WHERE m.reper = lp.reper
  AND m.client = lp.client
  AND m.deleted_at IS NULL;
```

**Expected Plan:**
```
Update on main_rows m  (cost=... rows=75000)
  ->  Hash Join  (cost=... rows=75000)
        Hash Cond: ((m.reper = lp.reper) AND (m.client = lp.client))
        ->  Seq Scan on main_rows m  (cost=... rows=75000)
              Filter: (deleted_at IS NULL)
        ->  Hash  (cost=... rows=42000)
              ->  Seq Scan on lista_programe lp  (cost=... rows=42000)
```

**Target Performance:**
- 75k rows: < 30 seconds
- 100k rows: < 60 seconds

### Performance Tips

1. **VACUUM ANALYZE after large imports:**
```sql
VACUUM ANALYZE app.main_rows;
VACUUM ANALYZE app.lista_programe;
```

2. **Monitor slow queries:**
```sql
-- Enable pg_stat_statements
CREATE EXTENSION pg_stat_statements;

-- Check slowest queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%main_rows%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

3. **Batch updates if needed:**
```sql
-- For very large tables (500k+ rows), batch by status or date range
UPDATE app.main_rows m
SET timp_per_buc = lp.timpi_masinare
FROM app.lista_programe lp
WHERE m.reper = lp.reper
  AND m.client = lp.client
  AND m.deleted_at IS NULL
  AND m.status = 'in_lucru'  -- Batch by status
LIMIT 10000;  -- Process in chunks
```

## Handling Edge Cases

### Case 1: Multiple Matches in lista_programe

**Problem:** Part has multiple programs (different indices)

**Current Solution:** Use `indice = '-'` (default)

**Alternative:** Use most recent program
```sql
UPDATE app.main_rows m
SET timp_per_buc = lp.timpi_masinare
FROM (
    SELECT DISTINCT ON (reper, client)
        reper, client, timpi_masinare, utilaj
    FROM app.lista_programe
    ORDER BY reper, client, data_programare DESC  -- Most recent first
) lp
WHERE m.reper = lp.reper
  AND m.client = lp.client;
```

### Case 2: Missing Reference Data

**Problem:** Part not in lista_programe

**Behavior:**
- Row not updated (derived columns remain NULL)
- Logged in `recalc_runs.unmatched_keys`

**User Notification:**
```sql
-- Query to show users which parts need programs
SELECT nr_fisa, reper, client
FROM app.main_rows m
WHERE deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM app.lista_programe lp
      WHERE lp.reper = m.reper AND lp.client = m.client
  );
```

### Case 3: Zero or NULL Quantity

**Problem:** `buc` is NULL or 0, but derived columns should still update

**Handling:**
```sql
-- Use COALESCE to handle NULL
ore_totale = COALESCE(m.buc * lp.timpi_masinare, 0)

-- Alternative: Keep NULL if buc is NULL
ore_totale = CASE 
    WHEN m.buc IS NULL THEN NULL
    ELSE m.buc * lp.timpi_masinare
END
```

### Case 4: Expired Prices

**Problem:** Price list entry expired (`valabil_pana_la` < today)

**Handling:**
```sql
AND (pl.valabil_pana_la IS NULL OR pl.valabil_pana_la >= CURRENT_DATE)
```

**Result:** Expired prices ignored, derived columns not updated

## Manual Recalculation

### Trigger Manual Run (Appsmith Button)

```javascript
// Appsmith button onClick
export default {
    async runRecalc() {
        try {
            const result = await InvokeLambda.run({
                functionName: 'pyramydal-prod-recalc',
                payload: {
                    triggered_by: 'manual',
                    triggered_by_user: appsmith.user.email
                }
            });
            
            showAlert(`Recalculation complete: ${result.rows_updated} rows updated`, 'success');
            GetRecalcRuns.run();
        } catch (error) {
            showAlert('Recalculation failed', 'error');
        }
    }
}
```

### Recalc Single Row (Real-time Update)

For immediate feedback after user edits:

```python
# Lambda function: manual_recalc_single_row
def recalc_single_row(row_id: int, db_conn):
    cursor = db_conn.cursor()
    
    cursor.execute("""
        UPDATE app.main_rows m
        SET 
            timp_per_buc = lp.timpi_masinare,
            ore_totale = COALESCE(m.buc * lp.timpi_masinare, 0),
            valoare_per_buc = pl.pret_per_buc,
            valoare_totala = COALESCE(m.buc * pl.pret_per_buc, 0)
        FROM app.lista_programe lp
        LEFT JOIN app.price_list pl ON pl.reper = m.reper
        WHERE m.id = %s
          AND m.reper = lp.reper
          AND m.client = lp.client
    """, (row_id,))
    
    db_conn.commit()
    cursor.close()
```

## Monitoring

### Key Metrics

```sql
-- Average recalc execution time (last 24 hours)
SELECT 
    AVG(execution_time_ms) as avg_time_ms,
    MAX(execution_time_ms) as max_time_ms,
    MIN(execution_time_ms) as min_time_ms
FROM app.recalc_runs
WHERE started_at >= NOW() - INTERVAL '24 hours'
  AND status = 'success';

-- Unmatched rate
SELECT 
    AVG(CASE WHEN rows_unmatched = 0 THEN 100.0 ELSE 100.0 * rows_matched / (rows_matched + rows_unmatched) END) as match_rate
FROM app.recalc_runs
WHERE started_at >= NOW() - INTERVAL '7 days';

-- Failure rate
SELECT 
    COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*) as failure_rate
FROM app.recalc_runs
WHERE started_at >= NOW() - INTERVAL '7 days';
```

### CloudWatch Dashboard

```python
# Metrics to track
metrics = [
    'ExecutionTime',
    'RowsUpdated',
    'MatchRate',
    'ErrorCount'
]

# Alarms
alarm = cloudwatch.MetricAlarm(
    alarm_name='recalc-failure',
    threshold=2,  # Alert if 2 consecutive failures
    comparison_operator='GreaterThanThreshold',
    evaluation_periods=2,
    metric_name='Errors',
    namespace='AWS/Lambda',
    dimensions={'FunctionName': 'pyramydal-prod-recalc'}
)
```

## Testing

### Unit Test (SQL)

```sql
-- Test recalc on sample data
BEGIN;

-- Insert test data
INSERT INTO main_rows (nr_fisa, reper, client, buc, created_by)
VALUES ('TEST001', 'TESTPART', 'TESTCLIENT', 10, 'test');

INSERT INTO lista_programe (reper, client, indice, timpi_masinare)
VALUES ('TESTPART', 'TESTCLIENT', '-', 0.5);

-- Run recalc
CALL app.recalc_derived_columns(uuid_generate_v4(), 'test', 'test');

-- Verify
SELECT 
    reper,
    client,
    buc,
    timp_per_buc,  -- Should be 0.5
    ore_totale     -- Should be 5.0 (10 * 0.5)
FROM main_rows
WHERE nr_fisa = 'TEST001';

ROLLBACK;  -- Clean up
```

### Integration Test (Python)

```python
import boto3
import json

lambda_client = boto3.client('lambda')

# Invoke recalc Lambda
response = lambda_client.invoke(
    FunctionName='pyramydal-prod-recalc',
    InvocationType='RequestResponse',
    Payload=json.dumps({
        'triggered_by': 'test',
        'triggered_by_user': 'test@example.com'
    })
)

result = json.loads(response['Payload'].read())

assert result['statusCode'] == 200
assert result['body']['rows_updated'] > 0
print(f"✅ Recalc test passed: {result['body']['rows_updated']} rows updated")
```

## Troubleshooting

### Problem: Recalc very slow (>60 seconds)

**Diagnosis:**
```sql
-- Check for missing indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'app'
  AND tablename IN ('main_rows', 'lista_programe', 'price_list');

-- Check for bloat
SELECT 
    schemaname, tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'app'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Solution:**
```sql
REINDEX TABLE app.main_rows;
VACUUM FULL app.main_rows;
ANALYZE app.main_rows;
```

### Problem: Many unmatched rows

**Diagnosis:**
```sql
-- Find common unmatched patterns
SELECT 
    SUBSTRING(reper, 1, 3) as reper_prefix,
    COUNT(*) as unmatched_count
FROM app.main_rows m
WHERE deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM app.lista_programe lp
      WHERE lp.reper = m.reper AND lp.client = m.client
  )
GROUP BY SUBSTRING(reper, 1, 3)
ORDER BY unmatched_count DESC;
```

**Solutions:**
1. Import missing programs to lista_programe
2. Create mapping table for reper aliases
3. Normalize reper/client values (trim, uppercase, etc.)

