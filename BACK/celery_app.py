import os
import sys
from celery import Celery
from dotenv import load_dotenv

# Add the current directory to Python path so local modules can be found
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv()
app = Celery(
    'ai_tasks',
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
)
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)
@app.task(bind=True, name='process_message_task')
def process_message(self, user_phone: str, message: str):
    """Фоновая задача для обработки сообщений пользователя.
    Args:
        self: Контекст задачи Celery
        user_phone: Номер телефона пользователя
        message: Текст сообщения
    Returns:
        str: Ответ от ИИ ассистента
    """
    from ai_service import ai_chat_service
    response = ""
    for chunk in ai_chat_service.send_message(user_phone, message):
        if chunk["type"] == "stream":
            response += chunk["content"]
        elif chunk["type"] == "complete":
            response = chunk["content"] or response
    return response

# Make the task available for direct import
process_message_task = process_message