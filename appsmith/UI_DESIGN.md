# Appsmith UI Design Guide

## Overview

This document describes how to implement the PyramydalV2 UI in Appsmith for managing 75k+ rows with server-side pagination, filtering, and automated calculations.

## Architecture Pattern

```
┌─────────────────┐
│  Appsmith UI    │ ← User interaction
└────────┬────────┘
         │ PostgreSQL queries (LIMIT/OFFSET)
         ▼
┌─────────────────┐
│  RDS PostgreSQL │ ← Single source of truth
└────────┬────────┘
         │ Recalc every 15min
         ▼
┌─────────────────┐
│  Lambda Recalc  │ ← Updates derived columns
└─────────────────┘
```

## Pages Structure

### 1. **Main Table** (Primary Work Area)

**Purpose:** View and edit production job data with pagination

**Components:**
- **Table Widget:** `tbl_main_rows`
- **Page Size:** 50 rows per page
- **Search Input:** `inp_search`
- **Filter Dropdowns:** `sel_client`, `sel_status`
- **Pagination:** Server-side with LIMIT/OFFSET

**SQL Query (MainTableQuery):**

```sql
-- Query name: GetMainRows
-- Type: SELECT
-- Run: On Page Load, On Search, On Filter Change

SELECT 
    id,
    nr_fisa,
    reper,
    client,
    buc,
    data_intrare,
    data_livrare,
    status,
    -- Editable columns
    comanda,
    observatii,
    strung_colchester,
    strung_cnc,
    -- Derived columns (read-only)
    timp_per_buc,
    ore_totale,
    valoare_per_buc,
    valoare_totala,
    utilaj_folosit,
    -- Audit
    updated_at,
    updated_by
FROM app.main_rows
WHERE deleted_at IS NULL
  AND (
    {{inp_search.text == '' ? 'TRUE' : 
      "nr_fisa ILIKE '%" + inp_search.text + "%' OR " +
      "reper ILIKE '%" + inp_search.text + "%' OR " +
      "client ILIKE '%" + inp_search.text + "%'"
    }}
  )
  AND ({{sel_client.selectedOptionValue == 'all' ? 'TRUE' : "client = '" + sel_client.selectedOptionValue + "'" }})
  AND ({{sel_status.selectedOptionValue == 'all' ? 'TRUE' : "status = '" + sel_status.selectedOptionValue + "'" }})
ORDER BY updated_at DESC
LIMIT {{tbl_main_rows.pageSize}}
OFFSET {{tbl_main_rows.pageOffset}};
```

**Count Query (for pagination):**

```sql
-- Query name: GetMainRowsCount
-- Type: SELECT

SELECT COUNT(*) as total
FROM app.main_rows
WHERE deleted_at IS NULL
  AND ({{inp_search.text == '' ? 'TRUE' : "nr_fisa ILIKE '%" + inp_search.text + "%' OR reper ILIKE '%" + inp_search.text + "%'" }})
  AND ({{sel_client.selectedOptionValue == 'all' ? 'TRUE' : "client = '" + sel_client.selectedOptionValue + "'" }});
```

**Table Configuration:**
- Enable inline editing for editable columns
- Make derived columns read-only (background color: light gray)
- Enable sorting on all columns
- Add column formatting:
  - `timp_per_buc`: Number format (4 decimals)
  - `valoare_per_buc`: Currency (2 decimals)
  - `data_livrare`: Date format (DD/MM/YYYY)

**Update Query (on cell edit):**

```sql
-- Query name: UpdateMainRow
-- Type: UPDATE
-- Run: On Row Save

UPDATE app.main_rows
SET 
    {{tbl_main_rows.updatedRowData.columnName}} = {{tbl_main_rows.updatedRowData.value}},
    updated_at = CURRENT_TIMESTAMP,
    updated_by = {{appsmith.user.email}}
WHERE id = {{tbl_main_rows.updatedRowData.id}};

-- Log edit
INSERT INTO app.user_edits (table_name, record_id, column_name, old_value, new_value, edited_by)
VALUES ('main_rows', {{tbl_main_rows.updatedRowData.id}}, '{{tbl_main_rows.updatedRowData.columnName}}', 
        {{tbl_main_rows.updatedRowData.oldValue}}, {{tbl_main_rows.updatedRowData.value}}, {{appsmith.user.email}});
```

---

### 2. **Reference Lists Pages**

#### 2A. Lista Programe

**Purpose:** View and manage program library

**SQL Query:**

```sql
-- Query name: GetListaPrograme
SELECT 
    id,
    reper,
    client,
    indice,
    soft_folosit,
    utilaj,
    timpi_masinare,
    programator,
    locatie_dosar,
    data_programare,
    updated_at
FROM app.lista_programe
ORDER BY updated_at DESC
LIMIT {{tbl_lista_programe.pageSize}}
OFFSET {{tbl_lista_programe.pageOffset}};
```

**Features:**
- View-only table (updates via XLSX import)
- Search by reper/client
- Export to CSV button

#### 2B. Price List

Similar structure to Lista Programe

---

### 3. **Uploads & Imports Page**

**Purpose:** Upload XLSX files and trigger imports

**Components:**

1. **File Uploader Widget:** `uploader_xlsx`
   - Accepted file types: `.xlsx`
   - Max file size: 10 MB
   
2. **Select Import Type:** `sel_import_type`
   - Options: lista_programe, price_list, timing_list, cnc_times

3. **Upload Button:** `btn_upload`
   - Action: Upload to S3 → Trigger Lambda

**Upload Flow:**

```javascript
// JavaScript in btn_upload onClick
export default {
    async uploadAndImport() {
        try {
            // 1. Upload file to S3 (using AWS SDK or presigned URL)
            const s3Key = `uploads/${sel_import_type.selectedOptionValue}/${uploader_xlsx.files[0].name}`;
            
            await UploadToS3.run({
                fileData: uploader_xlsx.files[0],
                s3Key: s3Key
            });
            
            // 2. Trigger Lambda import
            await TriggerImport.run({
                s3_key: s3Key,
                import_type: sel_import_type.selectedOptionValue,
                uploaded_by: appsmith.user.email
            });
            
            // 3. Show success message
            showAlert('Import started successfully', 'success');
            
            // 4. Refresh import history
            GetImportHistory.run();
            
        } catch (error) {
            showAlert('Import failed: ' + error.message, 'error');
        }
    }
}
```

**Lambda Trigger Query:**

```sql
-- Query name: TriggerImport
-- Type: Custom API
-- Method: POST
-- URL: https://lambda-url.execute-api.eu-central-1.amazonaws.com/import

-- Body:
{
  "s3_key": "{{this.params.s3_key}}",
  "import_type": "{{this.params.import_type}}",
  "uploaded_by": "{{this.params.uploaded_by}}"
}
```

**Import History Table:**

```sql
-- Query name: GetImportHistory
SELECT 
    import_id,
    import_type,
    file_name,
    started_at,
    completed_at,
    status,
    rows_loaded,
    rows_rejected,
    validation_errors
FROM app.v_recent_imports
ORDER BY started_at DESC
LIMIT 50;
```

**Status Indicator:**
- Success: Green badge
- Failed: Red badge with error details
- Pending: Yellow spinner

---

### 4. **Recalculation Control Page**

**Purpose:** Monitor and trigger recalculations

**Components:**

1. **Auto-refresh status widget** (shows last run)
2. **"Run Now" button** → Trigger Lambda manually
3. **Recent runs table** (last 100 runs)

**Manual Trigger Query:**

```javascript
// Query name: TriggerRecalc
// Type: Custom API or AWS Lambda invoke

export default {
    async runRecalc() {
        try {
            await InvokeLambda.run({
                functionName: 'pyramydal-prod-recalc',
                payload: {
                    triggered_by: 'manual',
                    triggered_by_user: appsmith.user.email
                }
            });
            
            showAlert('Recalculation started', 'success');
            setTimeout(() => GetRecalcRuns.run(), 3000);
        } catch (error) {
            showAlert('Failed to start recalculation', 'error');
        }
    }
}
```

**Recalc History:**

```sql
-- Query name: GetRecalcRuns
SELECT 
    run_id,
    started_at,
    completed_at,
    status,
    rows_updated,
    rows_matched,
    rows_unmatched,
    execution_time_ms,
    triggered_by
FROM app.v_recent_recalcs
ORDER BY started_at DESC
LIMIT 100;
```

**Unmatched Keys Widget:**

```sql
-- Query name: GetUnmatchedKeys
-- Shows rows that couldn't be matched to reference data

SELECT 
    nr_fisa,
    reper,
    client,
    lista_programe_status,
    price_list_status
FROM app.v_unmatched_main_rows
LIMIT 100;
```

---

### 5. **Export Page**

**Purpose:** Export data to XLSX/CSV

**SQL Query:**

```sql
-- Query name: ExportMainRows
-- Type: SELECT
-- Export: Enable "Download" button in table widget

SELECT 
    nr_fisa,
    reper,
    client,
    buc,
    data_intrare,
    data_livrare,
    comanda,
    status,
    -- Derived columns
    timp_per_buc,
    ore_totale,
    valoare_per_buc,
    valoare_totala,
    utilaj_folosit,
    soft_folosit,
    programator
FROM app.main_rows
WHERE deleted_at IS NULL
  AND ({{sel_export_filter.selectedOptionValue == 'all' ? 'TRUE' : "status = '" + sel_export_filter.selectedOptionValue + "'" }})
ORDER BY nr_fisa;
```

**Export Button:**
- Uses Appsmith's built-in table export feature
- Format options: CSV, XLSX
- Filename: `pyramydal_export_{{moment().format('YYYYMMDD_HHmmss')}}.xlsx`

---

## Server-Side Pagination Pattern

### Key Principles

1. **Never load all 75k rows** - Always use LIMIT/OFFSET
2. **Count query separate** - Get total count for pagination widget
3. **Indexes are critical** - Ensure DB indexes on filtered columns

### Implementation

```javascript
// Table widget properties
{
    serverSidePagination: true,
    totalRecordsCount: {{GetMainRowsCount.data[0].total}},
    pageSize: 50,
    onPageChange: {{GetMainRows.run()}}
}
```

---

## Performance Optimization

### Database Query Optimization

```sql
-- Always include these patterns:

-- 1. WHERE deleted_at IS NULL (uses index)
-- 2. ORDER BY indexed column
-- 3. LIMIT to reasonable number (50-100)
-- 4. OFFSET for pagination

-- Example optimized query:
SELECT id, nr_fisa, reper, client, buc, updated_at
FROM app.main_rows
WHERE deleted_at IS NULL
  AND status = 'in_lucru'
ORDER BY updated_at DESC
LIMIT 50
OFFSET {{tbl_main_rows.pageNo * 50}};
```

### UI Performance Tips

1. **Debounce search input** (500ms delay)
2. **Cache filter options** (don't re-query on every render)
3. **Use lightweight widgets** for status indicators
4. **Disable auto-refresh** on large tables (use manual refresh button)

---

## Access Control

### Role-Based Permissions

```javascript
// Check user role
const userRole = appsmith.user.email.includes('@yourcompany.com') ? 'admin' : 'viewer';

// Conditional rendering
{
    isVisible: {{appsmith.user.email.includes('@yourcompany.com')}}
}
```

### Column-Level Permissions

```javascript
// Make derived columns non-editable
{
    isEditable: {{tbl_main_rows.selectedColumn !== 'timp_per_buc' && 
                   tbl_main_rows.selectedColumn !== 'ore_totale'}}
}
```

---

## Error Handling

### User-Friendly Error Messages

```javascript
try {
    await UpdateMainRow.run();
    showAlert('Changes saved successfully', 'success');
} catch (error) {
    if (error.message.includes('unique constraint')) {
        showAlert('This combination already exists', 'error');
    } else if (error.message.includes('foreign key')) {
        showAlert('Invalid reference data', 'error');
    } else {
        showAlert('Failed to save: ' + error.message, 'error');
    }
}
```

---

## Testing Checklist

- [ ] Search works with 75k rows (< 2 seconds)
- [ ] Pagination loads pages without timeout
- [ ] Edit and save updates correct row
- [ ] Derived columns are read-only
- [ ] XLSX import validates and loads correctly
- [ ] Recalc updates derived columns
- [ ] Export generates correct file
- [ ] Multiple users can edit simultaneously (no conflicts)

---

## Deployment Checklist

1. Create PostgreSQL datasource in Appsmith
2. Import all SQL queries
3. Create all pages and widgets
4. Test with sample data (1000 rows first)
5. Performance test with full 75k rows
6. Set up user accounts and roles
7. Configure HTTPS and domain
8. Train users on UI

