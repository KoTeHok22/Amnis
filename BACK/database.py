import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, ProgrammingError
from dotenv import load_dotenv
load_dotenv()
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://Amnis:Amnis0987@db:5432/dream_interpreter"
)
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)

# Import Base from models so that create_all() sees all registered models
from models import Base

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db_tables():
    """Initialize database tables if they don't exist."""
    try:
        # Test if we can connect to the database
        with engine.connect() as conn:
            # Try to query the users table to see if it exists
            try:
                result = conn.execute(text("SELECT 1 FROM users LIMIT 1"))
            except (ProgrammingError, OperationalError):
                # Table doesn't exist, create all tables
                print("Database tables not found, creating them...")
                Base.metadata.create_all(bind=engine)
                print("Database tables created successfully!")
            else:
                print("Database tables already exist.")
    except Exception as e:
        print(f"Error initializing database tables: {e}")
        # Re-raise the exception to prevent the application from starting
        # with an uninitialized database
        raise

def get_db():
    """Генератор сессии базы данных для FastAPI.
    Yields:
        Session: Сессия базы данных
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()