-- Recalculation stored procedures
-- SQL-based UPDATE...FROM joins for performance

SET search_path TO app, public;

-- ============================================================================
-- PROCEDURE: recalc_derived_columns
-- Updates all derived columns in main_rows based on reference tables
-- Called by Lambda every 15 minutes
-- ============================================================================

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
    v_rows_updated_utilaj INTEGER;
    v_total_rows INTEGER;
    v_matched_rows INTEGER;
BEGIN
    -- Start run tracking
    v_start_time := clock_timestamp();
    
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
    -- STEP 1: Update time-based derived columns from lista_programe
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
      AND lp.indice = '-';  -- Use default indice, or modify join logic as needed
    
    GET DIAGNOSTICS v_rows_updated_timp = ROW_COUNT;
    
    -- ========================================================================
    -- STEP 2: Update price-based derived columns from price_list
    -- ========================================================================
    
    UPDATE app.main_rows m
    SET 
        valoare_per_buc = pl.pret_per_buc,
        valoare_totala = COALESCE(m.buc * pl.pret_per_buc, 0),
        recalc_at = v_start_time
    FROM app.price_list pl
    WHERE m.reper = pl.reper
      AND (pl.client IS NULL OR pl.client = m.client)  -- Support generic or client-specific pricing
      AND m.deleted_at IS NULL
      AND (pl.valabil_pana_la IS NULL OR pl.valabil_pana_la >= CURRENT_DATE);  -- Only valid prices
    
    GET DIAGNOSTICS v_rows_updated_valoare = ROW_COUNT;
    
    -- ========================================================================
    -- STEP 3: Calculate matched rows (rows with at least one update)
    -- ========================================================================
    
    SELECT COUNT(*) INTO v_matched_rows
    FROM app.main_rows
    WHERE deleted_at IS NULL
      AND recalc_at = v_start_time;
    
    -- ========================================================================
    -- STEP 4: Complete run tracking
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
    
    -- Log unmatched keys (sample)
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
        -- Log failure
        UPDATE app.recalc_runs
        SET 
            completed_at = clock_timestamp(),
            status = 'failed',
            error_message = SQLERRM
        WHERE run_id = p_run_id;
        
        RAISE;
END;
$$;

COMMENT ON PROCEDURE app.recalc_derived_columns IS 'Recalculates all derived columns in main_rows using SQL joins';

-- ============================================================================
-- FUNCTION: validate_staging_lista_programe
-- Validates data in staging table before swapping to live
-- Returns validation errors as JSON array
-- ============================================================================

CREATE OR REPLACE FUNCTION app.validate_staging_lista_programe()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_errors JSONB := '[]'::JSONB;
    v_count INTEGER;
    v_duplicates JSONB;
BEGIN
    -- Check 1: Staging table not empty
    SELECT COUNT(*) INTO v_count FROM app.staging_lista_programe;
    IF v_count = 0 THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'empty_staging',
            'message', 'Staging table is empty'
        );
    END IF;
    
    -- Check 2: Required columns not null
    SELECT COUNT(*) INTO v_count
    FROM app.staging_lista_programe
    WHERE reper IS NULL OR client IS NULL;
    
    IF v_count > 0 THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'null_required_columns',
            'message', format('%s rows have null reper or client', v_count)
        );
    END IF;
    
    -- Check 3: Duplicate keys
    SELECT jsonb_agg(dup) INTO v_duplicates
    FROM (
        SELECT reper, client, indice, COUNT(*) as dup_count
        FROM app.staging_lista_programe
        GROUP BY reper, client, indice
        HAVING COUNT(*) > 1
        LIMIT 10
    ) dup;
    
    IF v_duplicates IS NOT NULL THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'duplicate_keys',
            'message', 'Duplicate reper+client+indice combinations found',
            'sample', v_duplicates
        );
    END IF;
    
    -- Check 4: Invalid numeric values
    SELECT COUNT(*) INTO v_count
    FROM app.staging_lista_programe
    WHERE timpi_masinare IS NOT NULL AND timpi_masinare < 0;
    
    IF v_count > 0 THEN
        v_errors := v_errors || jsonb_build_object(
            'error', 'negative_times',
            'message', format('%s rows have negative timpi_masinare', v_count)
        );
    END IF;
    
    RETURN v_errors;
END;
$$;

-- ============================================================================
-- PROCEDURE: swap_staging_to_live
-- Atomically swaps staging table to live table
-- ============================================================================

CREATE OR REPLACE PROCEDURE app.swap_staging_to_live(
    p_table_name VARCHAR,
    p_import_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_staging_table VARCHAR;
    v_live_table VARCHAR;
    v_row_count INTEGER;
BEGIN
    v_staging_table := 'app.staging_' || p_table_name;
    v_live_table := 'app.' || p_table_name;
    
    -- Validate staging table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'app' AND table_name = 'staging_' || p_table_name
    ) THEN
        RAISE EXCEPTION 'Staging table % does not exist', v_staging_table;
    END IF;
    
    -- Get row count
    EXECUTE format('SELECT COUNT(*) FROM %s', v_staging_table) INTO v_row_count;
    
    -- Atomic swap within transaction
    BEGIN
        -- Truncate live table
        EXECUTE format('TRUNCATE TABLE %s', v_live_table);
        
        -- Copy from staging to live
        EXECUTE format(
            'INSERT INTO %s SELECT * FROM %s',
            v_live_table,
            v_staging_table
        );
        
        -- Update audit log
        UPDATE app.imports_audit
        SET 
            status = 'success',
            rows_loaded = v_row_count,
            completed_at = CURRENT_TIMESTAMP
        WHERE import_id = p_import_id;
        
        COMMIT;
    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback on error
            UPDATE app.imports_audit
            SET 
                status = 'rolled_back',
                error_message = SQLERRM,
                completed_at = CURRENT_TIMESTAMP
            WHERE import_id = p_import_id;
            
            RAISE;
    END;
END;
$$;

COMMENT ON PROCEDURE app.swap_staging_to_live IS 'Atomically replaces live table with validated staging data';

