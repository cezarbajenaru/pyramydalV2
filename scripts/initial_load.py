#!/usr/bin/env python3
"""
Initial data load script: Load existing Excel data into PostgreSQL
"""

import argparse
import sys
from datetime import datetime
import psycopg2
import openpyxl
from typing import Dict, Any


def parse_args():
    parser = argparse.ArgumentParser(description='Load Excel data into PostgreSQL')
    parser.add_argument('--excel', required=True, help='Path to Excel file')
    parser.add_argument('--sheet', default='PAGINA PRINCIPALA', help='Sheet name')
    parser.add_argument('--db-host', required=True, help='Database host')
    parser.add_argument('--db-name', default='production', help='Database name')
    parser.add_argument('--db-user', required=True, help='Database user')
    parser.add_argument('--db-password', required=True, help='Database password')
    parser.add_argument('--dry-run', action='store_true', help='Dry run (no commits)')
    return parser.parse_args()


def connect_db(host, dbname, user, password):
    """Connect to PostgreSQL"""
    print(f"Connecting to PostgreSQL: {host}/{dbname}")
    return psycopg2.connect(
        host=host,
        database=dbname,
        user=user,
        password=password
    )


def parse_excel(filepath, sheet_name):
    """Parse Excel file"""
    print(f"Loading Excel file: {filepath}")
    print(f"Sheet: {sheet_name}")
    
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    
    if sheet_name not in wb.sheetnames:
        print(f"❌ Sheet '{sheet_name}' not found!")
        print(f"Available sheets: {wb.sheetnames}")
        sys.exit(1)
    
    ws = wb[sheet_name]
    
    print(f"Dimensions: {ws.max_row} rows x {ws.max_column} cols")
    
    # Get headers
    headers_row = list(ws.iter_rows(min_row=1, max_row=1, values_only=True))[0]
    headers = [str(h).strip() if h else f'col_{i}' for i, h in enumerate(headers_row)]
    
    print(f"Headers: {headers[:10]}...")
    
    # Column mapping (adjust based on your Excel structure)
    column_mapping = {
        'NR FISA': 'nr_fisa',
        'Reper': 'reper',
        'Client': 'client',
        'Buc.': 'buc',
        # Add more mappings as needed
    }
    
    # Parse data rows
    data = []
    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(row):  # Skip empty rows
            continue
        
        row_dict = {}
        for header, cell_value in zip(headers, row):
            db_col = column_mapping.get(header, header.lower().replace(' ', '_'))
            row_dict[db_col] = cell_value
        
        row_dict['_source_row'] = row_idx
        data.append(row_dict)
    
    wb.close()
    
    print(f"Parsed {len(data)} data rows")
    return data


def clean_data(data):
    """Clean and validate data"""
    print("Cleaning data...")
    
    cleaned = []
    errors = []
    
    for row in data:
        try:
            # Trim strings
            if 'reper' in row and row['reper']:
                row['reper'] = str(row['reper']).strip()
            if 'client' in row and row['client']:
                row['client'] = str(row['client']).strip()
            
            # Validate required fields
            if not row.get('nr_fisa'):
                errors.append(f"Row {row['_source_row']}: Missing nr_fisa")
                continue
            if not row.get('reper'):
                errors.append(f"Row {row['_source_row']}: Missing reper")
                continue
            
            cleaned.append(row)
        except Exception as e:
            errors.append(f"Row {row['_source_row']}: {str(e)}")
    
    if errors:
        print(f"⚠️  {len(errors)} rows with errors:")
        for err in errors[:10]:  # Show first 10
            print(f"  - {err}")
    
    print(f"✅ {len(cleaned)} rows cleaned successfully")
    return cleaned, errors


def load_to_db(db_conn, data, dry_run=False):
    """Load data into PostgreSQL"""
    print(f"Loading {len(data)} rows to database...")
    
    if dry_run:
        print("🔍 DRY RUN - No data will be committed")
    
    cursor = db_conn.cursor()
    
    inserted = 0
    failed = 0
    
    for row in data:
        try:
            cursor.execute("""
                INSERT INTO app.main_rows (
                    nr_fisa, reper, client, buc, 
                    created_by, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                row.get('nr_fisa'),
                row.get('reper'),
                row.get('client'),
                row.get('buc'),
                'migration',
                datetime.now()
            ))
            inserted += 1
        except Exception as e:
            print(f"❌ Failed to insert row {row.get('_source_row')}: {e}")
            failed += 1
    
    if dry_run:
        db_conn.rollback()
        print("🔄 Rolled back (dry run)")
    else:
        db_conn.commit()
        print("✅ Committed to database")
    
    cursor.close()
    
    print(f"Summary: {inserted} inserted, {failed} failed")
    return inserted, failed


def main():
    args = parse_args()
    
    print("=" * 50)
    print("PyramydalV2 Initial Data Load")
    print("=" * 50)
    
    # Parse Excel
    data = parse_excel(args.excel, args.sheet)
    
    # Clean data
    cleaned_data, errors = clean_data(data)
    
    if not cleaned_data:
        print("❌ No valid data to load!")
        sys.exit(1)
    
    # Connect to DB
    db_conn = connect_db(args.db_host, args.db_name, args.db_user, args.db_password)
    
    # Load data
    inserted, failed = load_to_db(db_conn, cleaned_data, dry_run=args.dry_run)
    
    # Close connection
    db_conn.close()
    
    print("=" * 50)
    if args.dry_run:
        print("✅ Dry run completed successfully!")
        print("Run without --dry-run to commit data")
    else:
        print("✅ Data load completed!")
        print(f"Inserted: {inserted} rows")
        if failed > 0:
            print(f"⚠️  Failed: {failed} rows")
    print("=" * 50)


if __name__ == '__main__':
    main()

