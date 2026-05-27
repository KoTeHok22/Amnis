import json
import os
import sys
from datetime import datetime

from celery import Celery
from dotenv import load_dotenv
import redis

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

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        _redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
    return _redis_client


def _stream_key(chat_id):
    return f"stream:{chat_id}"


def _stream_status_key(chat_id):
    return f"stream_status:{chat_id}"


@app.task(bind=True, name='process_message_stream_task')
def process_message_stream(self, user_phone: str, message: str):
    from ai_service import ai_chat_service

    r = _get_redis()

    current_chat_id = ai_chat_service._get_current_chat_id(user_phone)
    if not current_chat_id:
        raise Exception("No active chat found for user.")

    status_key = _stream_status_key(current_chat_id)
    stream_key = _stream_key(current_chat_id)

    r.delete(stream_key)
    r.delete(status_key)

    r.set(status_key, json.dumps({
        "status": "generating",
        "partial_content": "",
        "position": 0,
        "chunks_sent": 0,
        "started_at": datetime.utcnow().isoformat(),
    }))

    try:
        full_response = ""
        chunk_count = 0
        for chunk in ai_chat_service.send_message(user_phone, message):
            content = chunk.get("content", "")
            phase = chunk.get("phase", "")
            chunk_type = chunk.get("type", "")

            if chunk_type == "stream" and phase == "answer" and content:
                full_response += content
                chunk_count += 1
                r.rpush(stream_key, json.dumps({"content": content, "phase": phase}))
                r.set(status_key, json.dumps({
                    "status": "generating",
                    "partial_content": full_response,
                    "position": chunk_count,
                    "chunks_sent": chunk_count,
                    "started_at": datetime.utcnow().isoformat(),
                }))
            elif chunk_type == "complete":
                pass

        r.set(status_key, json.dumps({
            "status": "completed",
            "partial_content": full_response,
            "position": chunk_count,
            "chunks_sent": chunk_count,
            "started_at": datetime.utcnow().isoformat(),
        }))
        r.rpush(stream_key, json.dumps({"type": "complete", "content": full_response}))

        return full_response
    except Exception as e:
        r.set(status_key, json.dumps({
            "status": "error",
            "partial_content": full_response,
            "position": chunk_count,
            "error": str(e),
        }))
        r.rpush(stream_key, json.dumps({"type": "error", "error": str(e)}))
        raise
    finally:
        r.expire(stream_key, 3600)
        r.expire(status_key, 3600)


@app.task(bind=True, name='process_message_task')
def process_message(self, user_phone: str, message: str):
    from ai_service import ai_chat_service
    response = ""
    for chunk in ai_chat_service.send_message(user_phone, message):
        if chunk["type"] == "stream":
            response += chunk["content"]
        elif chunk["type"] == "complete":
            response = chunk["content"] or response
    return response


process_message_task = process_message
process_message_stream_task = process_message_stream
