#!/bin/bash
set -e

# Create the database if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    SELECT 'CREATE DATABASE $POSTGRES_DB' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB');
EOSQL

# Create the user if it doesn't exist (PostgreSQL 12+ doesn't allow duplicate users)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    DO
    \$\$
    BEGIN
       IF NOT EXISTS (
          SELECT FROM pg_catalog.pg_roles WHERE rolname = '$POSTGRES_USER'
       ) THEN
          CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';
          ALTER USER $POSTGRES_USER CREATEDB;
       END IF;
    END
    \$\$;
EOSQL

echo "Database and user setup completed"