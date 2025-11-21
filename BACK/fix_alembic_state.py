#!/usr/bin/env python3
"""
Utility script to check and fix alembic migration state.
This script checks if all expected columns exist in the database and
stamps the alembic version if needed.
"""
import sys
import os
from sqlalchemy import create_engine, text
from alembic.config import Config
from alembic import command

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def check_column_exists(connection, table_name, column_name):
    """Check if a column exists in a table."""
    result = connection.execute(text("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name=:table_name AND column_name=:column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None

def check_table_exists(connection, table_name):
    """Check if a table exists."""
    result = connection.execute(text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = :table_name
        )
    """), {"table_name": table_name})
    return result.fetchone()[0]

def check_and_fix_alembic_state():
    """Check if database schema matches expected state and fix if needed."""
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://Amnis:Amnis0987@db:5432/dream_interpreter"
    )
    
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        # Check if all required tables and columns exist
        users_table_exists = check_table_exists(conn, 'users')
        chats_table_exists = check_table_exists(conn, 'chats')
        
        # Check for required columns in users table
        required_user_columns = [
            'id', 'phone_number', 'name', 'birth_date', 'password_hash', 
            'is_active', 'created_at', 'updated_at', 'available_analyses'
        ]
        
        user_columns_exist = all(
            check_column_exists(conn, 'users', col) 
            for col in required_user_columns
        )
        
        # Check for required columns in chats table
        required_chat_columns = [
            'id', 'user_id', 'chat_id', 'title', 'created_at', 
            'updated_at', 'is_active', 'dream_summary'
        ]
        
        chat_columns_exist = all(
            check_column_exists(conn, 'chats', col) 
            for col in required_chat_columns
        )
        
        # If all expected columns exist, we can stamp the alembic version to head
        if users_table_exists and chats_table_exists and user_columns_exist and chat_columns_exist:
            print("All expected tables and columns exist. Stamping alembic version to head...")
            
            alembic_cfg = Config("alembic.ini")
            alembic_cfg.set_main_option("sqlalchemy.url", database_url)
            
            try:
                command.stamp(alembic_cfg, "head")
                print("Alembic version stamped to head successfully!")
                return True
            except Exception as e:
                print(f"Error stamping alembic version: {e}")
                return False
        else:
            print("Not all expected tables/columns exist, running migrations instead...")
            return False

if __name__ == "__main__":
    success = check_and_fix_alembic_state()
    if success:
        print("Database alembic state fixed successfully.")
        sys.exit(0)
    else:
        print("Could not fix alembic state, migrations will run normally.")
        sys.exit(1)