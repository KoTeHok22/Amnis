#!/usr/bin/env python3
"""
Startup script with retry logic for database operations.
This script will keep trying to initialize the database and run migrations 
until they succeed, to handle any timing issues with the database service.
"""
import sys
import os
import time
import subprocess
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def wait_for_database(max_retries=30, delay=5):
    """Wait for database to be available with retry logic."""
    logger.info("Waiting for database to be available...")
    
    for attempt in range(max_retries):
        try:
            import psycopg2
            from urllib.parse import urlparse
            
            database_url = os.getenv(
                "DATABASE_URL",
                "postgresql://Amnis:Amnis0987@db:5432/dream_interpreter"
            )
            
            # Parse the database URL
            parsed = urlparse(database_url)
            conn = psycopg2.connect(
                host=parsed.hostname,
                port=parsed.port or 5432,
                user=parsed.username,
                password=parsed.password,
                database=parsed.path[1:]  # Remove leading slash
            )
            conn.close()
            logger.info("Database is available!")
            return True
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1}/{max_retries} - Database not ready: {e}")
            time.sleep(delay)
    
    logger.error("Could not connect to database after maximum attempts")
    return False

def run_migrations_with_retry(max_retries=3, delay=10):
    """Run database migrations with retry logic."""
    logger.info(f"Running database migrations with up to {max_retries} retries...")

    for attempt in range(max_retries):
        try:
            logger.info(f"Migration attempt {attempt + 1}/{max_retries}")

            # Import and run migrations
            from ensure_migrations import run_migrations
            success = run_migrations()

            if success:
                logger.info("Database migrations completed successfully!")
                return True
            else:
                logger.warning(f"Migration attempt {attempt + 1} failed")
        except Exception as e:
            logger.warning(f"Migration attempt {attempt + 1} failed with error: {e}")
            import traceback
            traceback.print_exc()

        if attempt < max_retries - 1:
            logger.info(f"Waiting {delay} seconds before next migration attempt...")
            time.sleep(delay)

    logger.error("All migration attempts failed")
    return False

def main():
    """Main startup function with retry logic."""
    logger.info("Starting application with database initialization retry logic...")
    
    # Wait for database
    if not wait_for_database():
        logger.error("Failed to connect to database. Exiting.")
        sys.exit(1)
    
    # Run migrations with retry
    if not run_migrations_with_retry():
        logger.error("Failed to run database migrations after all attempts. Exiting.")
        sys.exit(1)
    
    logger.info("Database initialization successful. Starting application server...")

    # Wait a bit more to ensure migrations are truly complete
    time.sleep(5)

    # Start the server
    try:
        import uvicorn
        from main import app

        port = int(os.getenv("PORT", 8000))
        host = os.getenv("HOST", "0.0.0.0")
        reload = os.getenv("RELOAD", "False").lower() == "true"

        logger.info(f"Starting Uvicorn server on {host}:{port}")
        uvicorn.run(app, host=host, port=port, reload=reload)
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()