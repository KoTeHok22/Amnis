import uvicorn
import os
from dotenv import load_dotenv
load_dotenv()

def run_server():
    """Запускает сервер uvicorn с параметрами из переменных окружения."""
    # Initialize database tables before starting the server
    from database import init_db_tables
    init_db_tables()

    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    reload = os.getenv("RELOAD", "False").lower() == "true"
    uvicorn.run("main:app", host=host, port=port, reload=reload)

if __name__ == "__main__":
    run_server()