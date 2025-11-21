import os
import httpx
from database import SessionLocal
from models import TelegramUser
import logging

logger = logging.getLogger(__name__)

BACKEND_BASE_URL = os.getenv('BACKEND_BASE_URL', 'https://api.jdh-team.ru')

async def get_telegram_auth_token(telegram_id: int, phone_number: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            auth_response = await client.post(
                f"{BACKEND_BASE_URL}/telegram/auth",
                json={
                    "telegram_id": telegram_id,
                    "phone_number": phone_number
                }
            )

            if auth_response.status_code == 200:
                auth_data = auth_response.json()
                return auth_data.get("access_token")
            else:
                logger.error(f"Telegram auth failed: {auth_response.text}")
                return None
    except Exception as e:
        logger.error(f"Error getting Telegram auth token: {e}")
        return None
    
    async def register_user_via_telegram(phone_number: str, password: str, name: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                register_response = await client.post(
                    f"{BACKEND_BASE_URL}/auth/register",
                    json={
                        "phone_number": phone_number,
                        "password": password,
                        "name": name
                    }
                )
    
                if register_response.status_code == 200:
                    return True
                else:
                    logger.error(f"Telegram registration failed: {register_response.text}")
                    return False
        except Exception as e:
            logger.error(f"Error registering user via Telegram: {e}")
            return False

async def store_token_for_telegram_user(telegram_id: int, token: str):
    db = SessionLocal()
    try:
        telegram_user = db.query(TelegramUser).filter(
            TelegramUser.telegram_id == telegram_id
        ).first()

        if telegram_user:
            telegram_user.access_token = token
            db.commit()
            return True
    except Exception as e:
        logger.error(f"Error storing token: {e}")
        db.rollback()
    finally:
        db.close()

    return False

async def get_token_for_telegram_user(telegram_id: int) -> str:
    db = SessionLocal()
    try:
        telegram_user = db.query(TelegramUser).filter(
            TelegramUser.telegram_id == telegram_id
        ).first()

        if telegram_user and telegram_user.access_token:
            return telegram_user.access_token
    except Exception as e:
        logger.error(f"Error retrieving token: {e}")
    finally:
        db.close()

    return None