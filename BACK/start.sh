#!/bin/bash
# Simple startup script for development and Docker

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Create tables in the database
python -c "
from models import Base
from database import engine
try:
    Base.metadata.create_all(bind=engine)
    print('Database tables created successfully!')
except Exception as e:
    print(f'Error creating tables: {e}')
"

# Start the FastAPI application
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload