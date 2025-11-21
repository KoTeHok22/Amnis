#!/usr/bin/env python3
"""
Script to initialize the database by creating all required tables.
"""
import sys
import os

# Add the current directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine
from models import Base

def init_db():
    """Initialize the database by creating all tables."""
    print("Creating database tables...")
    try:
        # Create all tables defined in models
        Base.metadata.create_all(bind=engine)
        print("Database tables created successfully!")
    except Exception as e:
        print(f"Error creating database tables: {e}")
        return False
    return True

if __name__ == "__main__":
    success = init_db()
    if success:
        print("Database initialization completed successfully.")
        sys.exit(0)
    else:
        print("Database initialization failed.")
        sys.exit(1)