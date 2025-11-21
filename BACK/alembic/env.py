from logging.config import fileConfig
from sqlalchemy import engine_from_config, text
from sqlalchemy import pool
from alembic import context
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata

def ensure_alembic_version_table(connection):
    # Check if alembic_version table exists
    table_exists = connection.execute(
        text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'alembic_version'
            )
        """)
    ).scalar()
    
    if not table_exists:
        # Create alembic_version table with longer version_num
        connection.execute(
            text("""
                CREATE TABLE alembic_version (
                    version_num VARCHAR(50) NOT NULL
                )
            """)
        )
    else:
        # Modify existing table if needed
        connection.execute(
            text("""
                ALTER TABLE alembic_version
                ALTER COLUMN version_num TYPE VARCHAR(50)
            """)
        )

def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Ensure alembic_version table has sufficient length
        ensure_alembic_version_table(connection)
        
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()