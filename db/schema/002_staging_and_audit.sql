-- Staging tables and audit infrastructure
-- For safe XLSX imports with validation

SET search_path TO app, public;

-- ============================================================================
-- STAGING TABLES: Safe import zone
-- Load XLSX data here first, validate, then swap to live tables
-- ============================================================================

-- Staging: Lista Programe
CREATE TABLE app.staging_lista_programe (
    LIKE app.lista_programe INCLUDING ALL
);
COMMENT ON TABLE app.staging_lista_programe IS 'Staging area for Lista Programe XLSX imports';

-- Staging: Price List
CREATE TABLE app.staging_price_list (
    LIKE app.price_list INCLUDING ALL
);
COMMENT ON TABLE app.staging_price_list IS 'Staging area for Price List XLSX imports';

-- Staging: Timing List
CREATE TABLE app.staging_timing_list (
    LIKE app.timing_list INCLUDING ALL
);
COMMENT ON TABLE app.staging_timing_list IS 'Staging area for Timing List XLSX imports';

-- Staging: CNC Times
CREATE TABLE app.staging_cnc_times (
    LIKE app.cnc_times INCLUDING ALL
);
COMMENT ON TABLE app.staging_cnc_times IS 'Staging area for CNC Times XLSX imports';

-- ============================================================================
-- AUDIT TABLE: imports_audit
-- Tracks all import operations (success and failures)
-- ============================================================================

CREATE TABLE app.imports_audit (
    id BIGSERIAL PRIMARY KEY,
    
    -- Import identification
    import_id UUID DEFAULT uuid_generate_v4(),
    import_type VARCHAR(50) NOT NULL,          -- 'lista_programe', 'price_list', etc.
    
    -- File details
    file_name VARCHAR(500) NOT NULL,
    file_s3_key VARCHAR(1000) NOT NULL,
    file_size_bytes BIGINT,
    file_uploaded_by VARCHAR(100),
    
    -- Import execution
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,               -- 'pending', 'validating', 'loading', 'success', 'failed'
    
    -- Results
    rows_loaded INTEGER,
    rows_rejected INTEGER,
    validation_errors JSONB,                   -- Array of validation error messages
    
    -- Processing details
    lambda_request_id VARCHAR(100),
    execution_time_ms INTEGER,
    error_message TEXT,
    
    -- Metadata
    created_by VARCHAR(100) DEFAULT 'system',
    
    CONSTRAINT chk_import_status CHECK (status IN ('pending', 'validating', 'loading', 'success', 'failed', 'rolled_back'))
);

CREATE INDEX idx_imports_audit_type ON app.imports_audit(import_type);
CREATE INDEX idx_imports_audit_status ON app.imports_audit(status);
CREATE INDEX idx_imports_audit_started_at ON app.imports_audit(started_at DESC);
CREATE INDEX idx_imports_audit_import_id ON app.imports_audit(import_id);

COMMENT ON TABLE app.imports_audit IS 'Complete audit log of all XLSX import operations';

-- ============================================================================
-- AUDIT TABLE: recalc_runs
-- Tracks automated recalculation runs (every 15 minutes)
-- ============================================================================

CREATE TABLE app.recalc_runs (
    id BIGSERIAL PRIMARY KEY,
    
    -- Run identification
    run_id UUID DEFAULT uuid_generate_v4(),
    
    -- Execution timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL,               -- 'running', 'success', 'failed', 'partial'
    
    -- Results
    rows_updated INTEGER,
    rows_matched INTEGER,                      -- Rows that matched join conditions
    rows_unmatched INTEGER,                    -- Rows without matching reference data
    
    -- Performance metrics
    execution_time_ms INTEGER,
    query_plan_changed BOOLEAN DEFAULT FALSE,  -- Flag if query planner changed strategy
    
    -- Derived column updates
    timp_per_buc_updated INTEGER,
    ore_totale_updated INTEGER,
    valoare_per_buc_updated INTEGER,
    valoare_totala_updated INTEGER,
    
    -- Errors
    error_message TEXT,
    unmatched_keys JSONB,                      -- Sample of unmatched reper+client combinations
    
    -- Trigger
    triggered_by VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'manual', 'post_import'
    triggered_by_user VARCHAR(100),
    
    CONSTRAINT chk_recalc_status CHECK (status IN ('running', 'success', 'failed', 'partial'))
);

CREATE INDEX idx_recalc_runs_started_at ON app.recalc_runs(started_at DESC);
CREATE INDEX idx_recalc_runs_status ON app.recalc_runs(status);
CREATE INDEX idx_recalc_runs_run_id ON app.recalc_runs(run_id);

COMMENT ON TABLE app.recalc_runs IS 'Audit log of automated recalculation runs';

-- ============================================================================
-- AUDIT TABLE: user_edits
-- Tracks individual cell edits from Appsmith UI
-- ============================================================================

CREATE TABLE app.user_edits (
    id BIGSERIAL PRIMARY KEY,
    
    -- What was edited
    table_name VARCHAR(100) NOT NULL,
    record_id BIGINT NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    
    -- Values
    old_value TEXT,
    new_value TEXT,
    
    -- Who and when
    edited_by VARCHAR(100) NOT NULL,
    edited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100)
);

CREATE INDEX idx_user_edits_table_record ON app.user_edits(table_name, record_id);
CREATE INDEX idx_user_edits_edited_by ON app.user_edits(edited_by);
CREATE INDEX idx_user_edits_edited_at ON app.user_edits(edited_at DESC);

COMMENT ON TABLE app.user_edits IS 'Detailed audit trail of user edits from UI';

-- ============================================================================
-- HELPER VIEW: Recent Import Summary
-- ============================================================================

CREATE VIEW app.v_recent_imports AS
SELECT 
    import_type,
    file_name,
    started_at,
    completed_at,
    status,
    rows_loaded,
    rows_rejected,
    EXTRACT(EPOCH FROM (completed_at - started_at)) AS duration_seconds,
    validation_errors
FROM app.imports_audit
ORDER BY started_at DESC
LIMIT 100;

COMMENT ON VIEW app.v_recent_imports IS 'Last 100 import operations for UI display';

-- ============================================================================
-- HELPER VIEW: Recent Recalculations
-- ============================================================================

CREATE VIEW app.v_recent_recalcs AS
SELECT 
    run_id,
    started_at,
    completed_at,
    status,
    rows_updated,
    rows_matched,
    rows_unmatched,
    execution_time_ms,
    triggered_by,
    error_message
FROM app.recalc_runs
ORDER BY started_at DESC
LIMIT 100;

COMMENT ON VIEW app.v_recent_recalcs IS 'Last 100 recalculation runs for monitoring';

-- ============================================================================
-- HELPER VIEW: Unmatched Records (for troubleshooting)
-- ============================================================================

CREATE VIEW app.v_unmatched_main_rows AS
SELECT 
    m.id,
    m.nr_fisa,
    m.reper,
    m.client,
    m.buc,
    CASE 
        WHEN lp.id IS NULL THEN 'Missing in lista_programe'
        ELSE 'OK'
    END AS lista_programe_status,
    CASE 
        WHEN pl.id IS NULL THEN 'Missing in price_list'
        ELSE 'OK'
    END AS price_list_status,
    m.updated_at
FROM app.main_rows m
LEFT JOIN app.lista_programe lp ON lp.reper = m.reper AND lp.client = m.client
LEFT JOIN app.price_list pl ON pl.reper = m.reper
WHERE m.deleted_at IS NULL
  AND (lp.id IS NULL OR pl.id IS NULL);

COMMENT ON VIEW app.v_unmatched_main_rows IS 'Main rows with missing reference data';

