"""
Lambda function: Recalculation
Runs every 15 minutes to update derived columns in main_rows
"""

import json
import os
import uuid
from datetime import datetime
import psycopg2
from typing import Dict, Any

# Environment variables
DB_HOST = os.environ['DB_HOST']
DB_NAME = os.environ['DB_NAME']
DB_USER = os.environ['DB_USER']
DB_PASSWORD = os.environ['DB_PASSWORD']


def lambda_handler(event, context):
    """
    Main handler for recalculation runs
    
    Event structure:
    {
        "triggered_by": "scheduled",  # or "manual", "post_import"
        "triggered_by_user": "user@example.com"  # optional
    }
    """
    
    try:
        # Parse input
        triggered_by = event.get('triggered_by', 'scheduled')
        triggered_by_user = event.get('triggered_by_user')
        
        run_id = str(uuid.uuid4())
        
        print(f"[{run_id}] Starting recalculation run")
        print(f"Triggered by: {triggered_by}")
        
        # Connect to database
        db_conn = get_db_connection()
        
        # Execute recalculation stored procedure
        start_time = datetime.now()
        
        cursor = db_conn.cursor()
        cursor.execute(
            "CALL app.recalc_derived_columns(%s, %s, %s)",
            (run_id, triggered_by, triggered_by_user)
        )
        db_conn.commit()
        
        # Fetch run results
        cursor.execute("""
            SELECT 
                status, rows_updated, rows_matched, rows_unmatched,
                execution_time_ms, error_message, unmatched_keys
            FROM app.recalc_runs
            WHERE run_id = %s
        """, (run_id,))
        
        result = cursor.fetchone()
        cursor.close()
        db_conn.close()
        
        if not result:
            raise Exception("Recalculation run record not found")
        
        status, rows_updated, rows_matched, rows_unmatched, exec_time_ms, error_msg, unmatched_keys = result
        
        print(f"[{run_id}] Recalculation completed")
        print(f"Status: {status}")
        print(f"Rows updated: {rows_updated}")
        print(f"Rows matched: {rows_matched}")
        print(f"Rows unmatched: {rows_unmatched}")
        print(f"Execution time: {exec_time_ms}ms")
        
        if unmatched_keys:
            print(f"Sample unmatched keys: {unmatched_keys}")
        
        response = {
            'statusCode': 200 if status == 'success' else 500,
            'body': json.dumps({
                'success': status == 'success',
                'run_id': run_id,
                'status': status,
                'rows_updated': rows_updated,
                'rows_matched': rows_matched,
                'rows_unmatched': rows_unmatched,
                'execution_time_ms': exec_time_ms,
                'error_message': error_msg,
                'unmatched_keys_sample': unmatched_keys
            })
        }
        
        return response
        
    except Exception as e:
        print(f"ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }


def get_db_connection():
    """Establish PostgreSQL connection"""
    return psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=10
    )


def manual_recalc_single_row(db_conn, row_id: int) -> Dict[str, Any]:
    """
    Recalculate a single row (for real-time updates on edit)
    This is an alternative pattern for immediate feedback
    """
    cursor = db_conn.cursor()
    
    # Update single row based on reference data
    cursor.execute("""
        UPDATE app.main_rows m
        SET 
            timp_per_buc = lp.timpi_masinare,
            ore_totale = COALESCE(m.buc * lp.timpi_masinare, 0),
            utilaj_folosit = lp.utilaj,
            soft_folosit = lp.soft_folosit,
            programator = lp.programator,
            locatie_dosar = lp.locatie_dosar,
            valoare_per_buc = pl.pret_per_buc,
            valoare_totala = COALESCE(m.buc * pl.pret_per_buc, 0),
            recalc_at = CURRENT_TIMESTAMP
        FROM app.lista_programe lp
        LEFT JOIN app.price_list pl ON pl.reper = m.reper
        WHERE m.id = %s
          AND m.reper = lp.reper
          AND m.client = lp.client
          AND lp.indice = '-'
    """, (row_id,))
    
    db_conn.commit()
    
    # Fetch updated row
    cursor.execute("""
        SELECT timp_per_buc, ore_totale, valoare_per_buc, valoare_totala
        FROM app.main_rows
        WHERE id = %s
    """, (row_id,))
    
    result = cursor.fetchone()
    cursor.close()
    
    if result:
        return {
            'timp_per_buc': float(result[0]) if result[0] else None,
            'ore_totale': float(result[1]) if result[1] else None,
            'valoare_per_buc': float(result[2]) if result[2] else None,
            'valoare_totala': float(result[3]) if result[3] else None
        }
    
    return {}

