#!/usr/bin/env python3
"""
Script to ensure database migrations are properly applied.
This script checks if the database schema is up to date and applies migrations if needed.
"""
import sys
import os
import time
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from alembic.config import Config
from alembic import command

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def wait_for_db_connection(database_url, max_attempts=30, delay=2):
    """Wait for database connection to be available."""
    print(f"Waiting for database connection at {database_url}...")
    engine = create_engine(database_url)

    for attempt in range(max_attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                print("Database connection established!")
                return True
        except OperationalError as e:
            print(f"Attempt {attempt + 1}/{max_attempts} - Database not ready: {e}")
            time.sleep(delay)

    print("Failed to connect to database after maximum attempts")
    return False

def run_migrations():
    """Run alembic migrations to ensure database schema is up to date."""
    print("Running database migrations or checking current state...")

    # Set the database URL for alembic
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql://Amnis:Amnis0987@db:5432/dream_interpreter"
    )

    # Wait for database connection
    if not wait_for_db_connection(database_url):
        print("ERROR: Could not connect to database. Exiting.")
        sys.exit(1)

    # First, try to check if we need to fix the alembic state
    try:
        from fix_alembic_state import check_and_fix_alembic_state
        if check_and_fix_alembic_state():
            print("Database state already correct, no migrations needed!")
            return True
    except Exception as e:
        print(f"Could not check/fix alembic state, proceeding with migrations: {e}")

    # Configure alembic
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", database_url)

    try:
        # Upgrade to head (latest) migration
        command.upgrade(alembic_cfg, "head")

        # Stamp the alembic version to ensure it's recorded
        command.stamp(alembic_cfg, "head")

        print("Database migrations applied successfully!")
        return True
    except Exception as e:
        print(f"Error applying migrations: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_migrations()
    if success:
        print("Database initialization completed successfully.")
        sys.exit(0)
    else:
        print("Database initialization failed.")
        sys.exit(1)