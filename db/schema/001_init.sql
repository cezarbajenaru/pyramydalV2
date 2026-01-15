-- PyramydalV2 Database Schema
-- PostgreSQL 15+
-- System of record for production job tracking

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search if needed

-- Create application schema
CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

-- ============================================================================
-- MAIN TABLE: main_rows
-- Represents the core job tracking data (~75k rows)
-- Mixed editable + derived columns
-- ============================================================================

CREATE TABLE app.main_rows (
    -- Primary key
    id BIGSERIAL PRIMARY KEY,
    
    -- Core identifiers (EDITABLE by users)
    nr_fisa VARCHAR(50) NOT NULL,              -- Job sheet number
    reper VARCHAR(100) NOT NULL,               -- Part number (join key)
    client VARCHAR(200) NOT NULL,              -- Customer name (join key)
    
    -- Job details (EDITABLE)
    buc INTEGER,                                -- Quantity (pieces)
    data_intrare DATE,                         -- Entry date
    data_livrare DATE,                         -- Delivery date
    comanda VARCHAR(100),                      -- Order number
    tratament VARCHAR(200),                    -- Treatment
    observatii TEXT,                           -- Notes/observations
    
    -- Machine/operation allocation (EDITABLE)
    -- User selects which machines/operations are needed
    strung_colchester NUMERIC(10,2),           -- Lathe hours
    strung_cnc NUMERIC(10,2),                  -- CNC lathe hours
    freze_mici NUMERIC(10,2),                  -- Small mills hours
    freze_mari NUMERIC(10,2),                  -- Large mills hours
    gaurire NUMERIC(10,2),                     -- Drilling hours
    rectificare NUMERIC(10,2),                 -- Grinding hours
    bwk NUMERIC(10,2),
    sip NUMERIC(10,2),
    norte NUMERIC(10,2),
    tos NUMERIC(10,2),
    bridgeport NUMERIC(10,2),
    eco NUMERIC(10,2),
    schaublin NUMERIC(10,2),
    hurco NUMERIC(10,2),
    matec NUMERIC(10,2),
    parpas NUMERIC(10,2),
    ajustare NUMERIC(10,2),                    -- Adjustment hours
    filetare NUMERIC(10,2),                    -- Threading hours
    marcare NUMERIC(10,2),                     -- Marking hours
    curatare_filete NUMERIC(10,2),             -- Thread cleaning hours
    
    -- DERIVED COLUMNS (auto-calculated, READ-ONLY in UI)
    timp_per_buc NUMERIC(10,4),                -- Time per piece (from Lista programe)
    ore_totale NUMERIC(10,2),                  -- Total hours (buc * timp_per_buc)
    valoare_per_buc NUMERIC(10,2),            -- Value per piece (from price list)
    valoare_totala NUMERIC(10,2),             -- Total value (buc * valoare_per_buc)
    utilaj_folosit VARCHAR(100),               -- Machine used (from Lista programe)
    soft_folosit VARCHAR(100),                 -- Software used (from Lista programe)
    programator VARCHAR(100),                  -- Programmer (from Lista programe)
    locatie_dosar VARCHAR(200),                -- Folder location (from Lista programe)
    
    -- Status tracking (EDITABLE)
    status VARCHAR(50) DEFAULT 'in_lucru',     -- in_lucru, finalizat, livrat, anulat
    control_status VARCHAR(50),                -- Quality control status
    magazie_status VARCHAR(50),                -- Warehouse status
    
    -- Audit fields (AUTO-MANAGED)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    recalc_at TIMESTAMP WITH TIME ZONE,        -- Last recalculation timestamp
    
    -- Soft delete support
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT chk_buc_positive CHECK (buc IS NULL OR buc > 0),
    CONSTRAINT chk_dates CHECK (data_livrare IS NULL OR data_intrare IS NULL OR data_livrare >= data_intrare)
);

-- Indexes for performance (CRITICAL for 75k+ rows)
CREATE INDEX idx_main_rows_reper ON app.main_rows(reper) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_client ON app.main_rows(client) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_reper_client ON app.main_rows(reper, client) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_nr_fisa ON app.main_rows(nr_fisa) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_status ON app.main_rows(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_updated_at ON app.main_rows(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_main_rows_data_livrare ON app.main_rows(data_livrare) WHERE deleted_at IS NULL AND data_livrare IS NOT NULL;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_main_rows_updated_at
    BEFORE UPDATE ON app.main_rows
    FOR EACH ROW
    EXECUTE FUNCTION app.update_updated_at_column();

-- Comment on derived columns for clarity
COMMENT ON COLUMN app.main_rows.timp_per_buc IS 'DERIVED: Auto-calculated from lista_programe';
COMMENT ON COLUMN app.main_rows.ore_totale IS 'DERIVED: Auto-calculated as buc * timp_per_buc';
COMMENT ON COLUMN app.main_rows.valoare_per_buc IS 'DERIVED: Auto-calculated from price_list';
COMMENT ON COLUMN app.main_rows.valoare_totala IS 'DERIVED: Auto-calculated as buc * valoare_per_buc';
COMMENT ON COLUMN app.main_rows.utilaj_folosit IS 'DERIVED: Auto-populated from lista_programe';

-- ============================================================================
-- REFERENCE TABLE: lista_programe
-- Program library with machining times (~42k rows)
-- Primary reference for deriving machining times
-- ============================================================================

CREATE TABLE app.lista_programe (
    id BIGSERIAL PRIMARY KEY,
    
    -- Join keys
    reper VARCHAR(100) NOT NULL,               -- Part number (join to main_rows)
    client VARCHAR(200) NOT NULL,              -- Customer name (join to main_rows)
    indice VARCHAR(50),                        -- Version/index
    
    -- Program details
    soft_folosit VARCHAR(100),                 -- Software used (PowerMill, etc.)
    utilaj VARCHAR(100),                       -- Machine/equipment
    data_programare DATE,                      -- Programming date
    programator VARCHAR(100),                  -- Programmer name
    observatii TEXT,                           -- Observations
    locatie_dosar VARCHAR(200),                -- Folder location
    timpi_masinare NUMERIC(10,4),              -- Machining time (hours per piece)
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one program per reper+client+indice combination
    CONSTRAINT uq_lista_programe_key UNIQUE (reper, client, indice)
);

-- Indexes for join performance
CREATE INDEX idx_lista_programe_reper ON app.lista_programe(reper);
CREATE INDEX idx_lista_programe_client ON app.lista_programe(client);
CREATE INDEX idx_lista_programe_reper_client ON app.lista_programe(reper, client);

COMMENT ON TABLE app.lista_programe IS 'Program library with machining times for each part/customer combination';

-- ============================================================================
-- REFERENCE TABLE: price_list
-- Pricing reference (to be populated via XLSX imports)
-- ============================================================================

CREATE TABLE app.price_list (
    id BIGSERIAL PRIMARY KEY,
    
    -- Join keys
    reper VARCHAR(100) NOT NULL,
    client VARCHAR(200),                       -- Optional: client-specific pricing
    
    -- Pricing
    pret_per_buc NUMERIC(10,2) NOT NULL,      -- Price per piece
    moneda VARCHAR(10) DEFAULT 'EUR',          -- Currency
    valabil_de_la DATE,                        -- Valid from date
    valabil_pana_la DATE,                      -- Valid until date
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_price_positive CHECK (pret_per_buc > 0)
);

CREATE INDEX idx_price_list_reper ON app.price_list(reper);
CREATE INDEX idx_price_list_reper_client ON app.price_list(reper, client);
CREATE INDEX idx_price_list_valid ON app.price_list(valabil_de_la, valabil_pana_la) WHERE valabil_pana_la IS NOT NULL;

-- ============================================================================
-- REFERENCE TABLE: timing_list
-- Additional timing reference (if separate from lista_programe)
-- ============================================================================

CREATE TABLE app.timing_list (
    id BIGSERIAL PRIMARY KEY,
    
    -- Join keys
    operatie VARCHAR(100) NOT NULL,            -- Operation type
    reper VARCHAR(100),                        -- Part number (optional)
    
    -- Timing
    timp_standard NUMERIC(10,4) NOT NULL,      -- Standard time (hours)
    descriere TEXT,                            -- Description
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timing_list_operatie ON app.timing_list(operatie);
CREATE INDEX idx_timing_list_reper ON app.timing_list(reper) WHERE reper IS NOT NULL;

-- ============================================================================
-- REFERENCE TABLE: cnc_times
-- CNC-specific timing data
-- ============================================================================

CREATE TABLE app.cnc_times (
    id BIGSERIAL PRIMARY KEY,
    
    -- Join keys
    masina VARCHAR(100) NOT NULL,              -- Machine name
    reper VARCHAR(100) NOT NULL,               -- Part number
    
    -- Timing
    timp_ciclu NUMERIC(10,4) NOT NULL,         -- Cycle time (hours)
    timp_setup NUMERIC(10,4),                  -- Setup time (hours)
    observatii TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_cnc_times_key UNIQUE (masina, reper)
);

CREATE INDEX idx_cnc_times_masina ON app.cnc_times(masina);
CREATE INDEX idx_cnc_times_reper ON app.cnc_times(reper);

-- ============================================================================
-- Grant permissions
-- ============================================================================

-- Create application user (will be set up separately)
-- GRANT USAGE ON SCHEMA app TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_user;

