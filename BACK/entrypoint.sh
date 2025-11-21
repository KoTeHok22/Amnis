#!/bin/sh
# Wait for PostgreSQL to be ready before starting the application

# Wait for the database to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h db -p 5432 -U ${POSTGRES_USER:-Amnis}
do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

echo "PostgreSQL is ready. Running database migrations..."

# Run our custom migration script which handles database readiness better
# Ensure alembic_version table has sufficient length before migrations
python -c "
import os
from sqlalchemy import create_engine, text

database_url = os.getenv('DATABASE_URL', 'postgresql://Amnis:Amnis0987@db:5432/dream_interpreter')
engine = create_engine(database_url)
with engine.connect() as conn:
    # Check if alembic_version table exists
    table_exists = conn.execute(
        text(\"\"\" SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'alembic_version'
        ) \"\"\")
    ).scalar()

    if table_exists:
        # Alter column to support longer revision IDs
        conn.execute(
            text(\"\"\"
                ALTER TABLE alembic_version
                ALTER COLUMN version_num TYPE VARCHAR(50)
            \"\"\")
        )
        conn.commit()  # Commit the transaction
        print('Successfully altered alembic_version table')
    else:
        print('alembic_version table not found - will be created during migrations')
"

# Run migrations after ensuring table schema is correct
python ensure_migrations.py

if [ $? -ne 0 ]; then
    echo "Failed to apply database migrations. Server startup failed."
    exit 1
fi

# Verify that essential tables exist
echo "Verifying database tables exist..."
python -c "
import os
import time
from sqlalchemy import create_engine, inspect, text

database_url = os.getenv('DATABASE_URL', 'postgresql://Amnis:Amnis0987@db:5432/dream_interpreter')
engine = create_engine(database_url)

max_attempts = 30
attempt = 0

while attempt < max_attempts:
    try:
        inspector = inspect(engine)
        required_tables = ['users']
        
        # Check if all required tables exist
        missing_tables = [table for table in required_tables if not inspector.has_table(table)]
        
        if not missing_tables:
            print('All required tables exist:', required_tables)
            # Do a final check by querying the users table
            with engine.connect() as conn:
                result = conn.execute(text('SELECT 1 FROM users LIMIT 1')).fetchone()
                print('Database verification successful!')
                break
        else:
            print(f'Attempt {attempt + 1}: Missing tables - {missing_tables}')
            time.sleep(2)
            attempt += 1
            
    except Exception as e:
        print(f'Attempt {attempt + 1}: Database verification failed - {e}')
        time.sleep(2)
        attempt += 1

if attempt >= max_attempts:
    print('Database verification failed after maximum attempts')
    exit 1
"

echo "Database migrations and verification completed. Starting the application..."
exec python run_server.py