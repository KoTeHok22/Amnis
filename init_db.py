import os
import time
from sqlalchemy import create_engine, text
import sys

# Database connection
database_url = os.getenv('DATABASE_URL', 'postgresql://Amnis:Amnis0987@db:5432/dream_interpreter')
print(f'Connecting to: {database_url}')

# Wait for database to be available
engine = create_engine(database_url)
for attempt in range(30):
    try:
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
            print('Database connection successful')
            break
    except Exception as e:
        print(f'Attempt {attempt + 1}/30 - Database not ready: {e}')
        time.sleep(2)
else:
    print('Could not connect to database after 30 attempts')
    sys.exit(1)

# Create tables directly with raw SQL (bypassing problematic alembic migrations)
with engine.connect() as conn:
    trans = conn.begin()
    try:
        # Create users table
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                phone_number VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                birth_date TIMESTAMP,
                password_hash VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                available_analyses INTEGER DEFAULT 0,
                subscription_expiry TIMESTAMP
            );
        '''))
        
        # Create chats table
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                chat_id VARCHAR(255) UNIQUE NOT NULL,
                title VARCHAR(255) NOT NULL,
                dream_summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            );
        '''))
        
        # Create telegram_users table
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS telegram_users (
                id SERIAL PRIMARY KEY,
                telegram_id INTEGER UNIQUE NOT NULL,
                username VARCHAR(255),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                phone_number VARCHAR(255),
                access_token VARCHAR(255),
                is_verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        '''))
        
        # Create alembic version table to mark migrations as completed
        conn.execute(text('''
            CREATE TABLE IF NOT EXISTS alembic_version (
                version_num VARCHAR(50) NOT NULL
            );
        '''))
        
        # Insert the latest migration version
        conn.execute(text("DELETE FROM alembic_version;"))
        conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('005_add_available_analyses_to_users');"))
        
        trans.commit()
        print('All tables created successfully!')
        
        # Verify tables exist
        result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"))
        tables = [row[0] for row in result.fetchall()]
        print(f'Created tables: {tables}')
        
    except Exception as e:
        trans.rollback()
        print(f'Error creating tables: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

print('Database initialization completed successfully!')