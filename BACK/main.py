from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import re
import json
import time
import asyncio
import redis
import os
from database import get_db
from models import User, Chat, Payment, TelegramUser
from auth import get_password_hash, authenticate_user, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, verify_token, TokenData
from ai_service import ai_chat_service
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from nicepay import create_nicepay_payment, verify_webhook_hash, NICEPAY_SECRET_KEY, NICEPAY_MERCHANT_ID

def normalize_phone_number(phone_number: str) -> str:
    """
    Normalize phone number by removing all non-digit characters.
    Converts formats like '+7 (999) 123-45-67' to '79991234567'
    """
    # Remove all non-digit characters
    normalized = re.sub(r'[^\d]', '', phone_number)

    # Handle country codes - if it starts with '8', replace with '7'
    if normalized.startswith('8'):
        normalized = '7' + normalized[1:]
    # If it starts with '+7', make sure it's '7'
    elif normalized.startswith('7') and len(normalized) == 11:
        normalized = normalized  # Already correct format
    elif normalized.startswith('7'):
        normalized = normalized  # Already correct format
    # If it starts with '1' (US/CA), keep it as is
    elif normalized.startswith('1') and len(normalized) >= 10:
        normalized = normalized
    # For other cases, if it looks like a valid number without country code, assume it's Russian
    elif len(normalized) == 10:  # Just digits without country code
        normalized = '7' + normalized

    return normalized

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
app = FastAPI()


_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        _redis = redis.Redis.from_url(redis_url, decode_responses=True)
    return _redis


def _stream_key(chat_id):
    return f"stream:{chat_id}"


def _stream_status_key(chat_id):
    return f"stream_status:{chat_id}"


def get_allowed_origins() -> list[str]:
    configured_origins = os.getenv("CORS_ALLOWED_ORIGINS")
    if configured_origins:
        return [origin.strip() for origin in configured_origins.split(",") if origin.strip()]

    return [
        "https://amnis.jdh-team.ru",
        "http://amnis.jdh-team.ru",
        "http://localhost:3891",
        "http://127.0.0.1:3891",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class CreateChatRequest(BaseModel):
    """Модель для создания чата"""
    title: str = "Dream Analysis Chat"
    initial_prompt: Optional[str] = None
class SendMessageRequest(BaseModel):
    """Модель для отправки сообщения в чат"""
    message: str
class UserCreate(BaseModel):
    """Модель для создания пользователя"""
    phone_number: str
    name: str
    birth_date: str
    password: str
class UserLogin(BaseModel):
    """Модель для входа пользователя"""
    phone_number: str
    password: str
class InitialPromptResponse(BaseModel):
    """Модель для ответа с начальным промптом"""
    initial_prompt: str
class ChatListResponse(BaseModel):
    """Модель для ответа со списком чатов пользователя"""
    chats: List[dict]
class SwitchChatRequest(BaseModel):
    """Модель для запроса смены чата"""
    chat_id: str
@app.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Регистрация нового пользователя по номеру телефона
    Args:
        user_data: Данные пользователя для регистрации
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о зарегистрированном пользователе и токене доступа
    """
    try:
        # Normalize the phone number
        normalized_phone = normalize_phone_number(user_data.phone_number)

        phone_pattern = re.compile(r'^\+?1?\d{9,15}$')
        if not phone_pattern.match(user_data.phone_number):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный формат номера телефона"
            )
        existing_user = db.query(User).filter(User.phone_number == normalized_phone).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь с таким номером телефона уже существует"
            )
        hashed_password = get_password_hash(user_data.password)

        # Try to parse birth_date if provided, otherwise set to None
        birth_date = None
        if user_data.birth_date:
            try:
                birth_date = datetime.fromisoformat(user_data.birth_date.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Неверный формат даты рождения. Используйте формат YYYY-MM-DD"
                )

        new_user = User(
            phone_number=normalized_phone,
            name=user_data.name,
            birth_date=birth_date,
            password_hash=hashed_password
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        access_token = create_access_token(
            data={"sub": new_user.phone_number},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        birth_date_str = new_user.birth_date.isoformat() if new_user.birth_date else None
        return {
            "message": "Пользователь успешно зарегистрирован",
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": new_user.id,
                "phone_number": new_user.phone_number,
                "name": new_user.name,
                "birth_date": birth_date_str
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Registration error: {str(e)}")  # Log the error for debugging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при регистрации"
        )

class TelegramRegisterRequest(BaseModel):
    """Модель для регистрации через Telegram"""
    phone_number: str
    password: str
    name: str

@app.post("/auth/register", status_code=status.HTTP_201_CREATED)
def register_telegram_user(
    request: TelegramRegisterRequest,
    db: Session = Depends(get_db)
):
    """Регистрация нового пользователя через Telegram
    Args:
        request: Данные пользователя из Telegram
        db: Сессия базы данных
    Returns:
        dict: Словарь с токеном доступа
    """
    try:
        # Normalize the phone number
        normalized_phone = normalize_phone_number(request.phone_number)

        phone_pattern = re.compile(r'^\+?1?\d{9,15}$')
        if not phone_pattern.match(request.phone_number):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный формат номера телефона"
            )
        existing_user = db.query(User).filter(User.phone_number == normalized_phone).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Пользователь с таким номером телефона уже существует"
            )
        hashed_password = get_password_hash(request.password)
        new_user = User(
            phone_number=normalized_phone,
            name=request.name,
            birth_date=None,  # Telegram registration doesn't require birth date
            password_hash=hashed_password
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        access_token = create_access_token(
            data={"sub": new_user.phone_number},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": new_user.id,
                "phone_number": new_user.phone_number,
                "name": new_user.name
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Telegram registration error: {str(e)}")  # Log the error for debugging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при регистрации"
        )
@app.post("/login")
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Вход пользователя по номеру телефона и паролю
    Args:
        user_data: Данные пользователя для входа
        db: Сессия базы данных
    Returns:
        dict: Словарь с токеном доступа
    """
    try:
        # Normalize the phone number for lookup
        normalized_phone = normalize_phone_number(user_data.phone_number)
        user = db.query(User).filter(User.phone_number == normalized_phone).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Пользователь не найден",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not authenticate_user(user.password_hash, user_data.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный номер телефона или пароль",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Аккаунт пользователя деактивирован",
                headers={"WWW-Authenticate": "Bearer"},
            )

        access_token = create_access_token(
            data={"sub": user.phone_number},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Login error: {str(e)}")  # Log the error for debugging
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при входе"
        )
@app.get("/verify-token")
def verify_token_endpoint(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Проверяет валидность JWT токена и возвращает информацию о пользователе
    Args:
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с номером телефона и статусом активности пользователя
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аккаунт пользователя деактивирован",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"phone_number": user.phone_number, "is_active": user.is_active}
@app.get("/profile")
def get_profile(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Возвращает информацию о профиле пользователя
    Args:
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о профиле пользователя
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аккаунт пользователя деактивирован",
            headers={"WWW-Authenticate": "Bearer"},
        )
    birth_date_str = user.birth_date.isoformat() if user.birth_date else None
    return {
        "id": user.id,
        "phone_number": user.phone_number,
        "name": user.name,
        "birth_date": birth_date_str,
        "available_analyses": user.available_analyses,
        "created_at": user.created_at.isoformat()
    }
class UpdateProfileRequest(BaseModel):
    """Модель для обновления профиля пользователя"""
    name: str
    birth_date: str
@app.put("/profile")
def update_profile(
    request: UpdateProfileRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Обновляет информацию в профиле пользователя
    Args:
        request: Запрос с новыми данными профиля
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с обновленной информацией профиля
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аккаунт пользователя деактивирован",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        birth_date = datetime.fromisoformat(request.birth_date.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный формат даты рождения. Используйте формат YYYY-MM-DD"
        )
    user.name = request.name
    user.birth_date = birth_date
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    birth_date_str = user.birth_date.isoformat() if user.birth_date else None
    return {
        "id": user.id,
        "phone_number": user.phone_number,
        "name": user.name,
        "birth_date": birth_date_str,
        "available_analyses": user.available_analyses,
        "updated_at": user.updated_at.isoformat()
    }
class ChangePasswordRequest(BaseModel):
    """Модель для смены пароля пользователя"""
    old_password: str
    new_password: str
@app.post("/change-password")
def change_password(
    request: ChangePasswordRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Изменяет пароль пользователя
    Args:
        request: Запрос с текущим и новым паролем
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с результатом операции
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аккаунт пользователя деактивирован",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not authenticate_user(user.password_hash, request.old_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль"
        )
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен содержать не менее 6 символов"
        )
    user.password_hash = get_password_hash(request.new_password)
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Пароль успешно изменен"}
class PaymentSuccessRequest(BaseModel):
    """Модель для подтверждения успешной оплаты"""
    plan: str
    analyses_count: int
    validity_days: int

@app.post("/payment/success")
def payment_success(
    request: PaymentSuccessRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Обновляет подписку пользователя после успешной оплаты
    Args:
        request: Запрос с параметрами подписки
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с результатом операции
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception

    # Update subscription details - add to existing analyses count
    user.available_analyses += request.analyses_count
    user.subscription_expiry = datetime.utcnow() + timedelta(days=request.validity_days)
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)  # Refresh to get the latest data

    return {
        "status": "success",
        "message": "Subscription updated",
        "available_analyses": user.available_analyses
    }

@app.get("/subscription")
def get_subscription(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Возвращает информацию о подписке пользователя
    Args:
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о подписке
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аккаунт пользователя деактивирован",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Calculate remaining days
    remaining_days = max(0, (user.subscription_expiry - datetime.utcnow()).days) if user.subscription_expiry else 0
    
    return {
        "plan": "Стандартный",
        "remainingAnalyses": user.available_analyses,
        "totalAnalyses": 10,  # This could be stored per plan if needed
        "expiresAt": user.subscription_expiry.isoformat() if user.subscription_expiry else None,
        "remainingDays": remaining_days
    }


class CreateNicePayPaymentRequest(BaseModel):
    plan: str


@app.post("/payment/nicepay/create")
async def create_nicepay_endpoint(
    request: CreateNicePayPaymentRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception

    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception

    # Map plan to analyses count, price (in RUB kopecks), and validity days
    plan_map = {
        "plan-1": {"analyses": 1, "price": 19900, "validity_days": 30},
        "plan-5": {"analyses": 5, "price": 79900, "validity_days": 90},
        "plan-10": {"analyses": 10, "price": 139900, "validity_days": 180},
        "plan-15": {"analyses": 15, "price": 189900, "validity_days": 365},
        "single": {"analyses": 1, "price": 19900, "validity_days": 30},
        "starter": {"analyses": 5, "price": 79900, "validity_days": 90},
        "standard": {"analyses": 10, "price": 139900, "validity_days": 180},
        "premium": {"analyses": 15, "price": 189900, "validity_days": 365},
    }

    plan_info = plan_map.get(request.plan)
    if not plan_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan selected"
        )

    # Generate unique order ID
    import uuid
    order_id = f"amnis_{user.id}_{uuid.uuid4().hex[:12]}"

    # Determine success/fail URLs
    frontend_url = os.getenv("FRONTEND_URL", "https://amnis.jdh-team.ru")
    success_url = f"{frontend_url}/?payment=success"
    fail_url = f"{frontend_url}/?payment=fail"

    try:
        nicepay_data = await create_nicepay_payment(
            order_id=order_id,
            customer=user.phone_number,
            amount=plan_info["price"],
            currency="RUB",
            description=f"Amnis: {plan_info['analyses']} analyses",
            success_url=success_url,
            fail_url=fail_url,
        )

        # Save payment record
        payment = Payment(
            order_id=order_id,
            nicepay_payment_id=nicepay_data.get("payment_id", ""),
            user_id=user.id,
            amount=plan_info["price"],
            currency="RUB",
            plan=request.plan,
            analyses_count=plan_info["analyses"],
            validity_days=plan_info["validity_days"],
            status="pending",
        )
        db.add(payment)
        db.commit()

        return {
            "status": "success",
            "payment_id": nicepay_data.get("payment_id"),
            "link": nicepay_data.get("link"),
            "amount": plan_info["price"],
            "currency": "RUB",
            "order_id": order_id,
        }
    except Exception as e:
        print(f"NicePay payment creation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create payment: {str(e)}"
        )


@app.get("/payment/nicepay/callback")
def nicepay_callback(
    result: str,
    payment_id: str,
    merchant_id: str,
    order_id: str,
    amount: str,
    amount_currency: str,
    profit: str,
    profit_currency: str,
    method: str,
    hash: str,
    db: Session = Depends(get_db)
):
    # Collect all params for hash verification
    all_params = {
        "result": result,
        "payment_id": payment_id,
        "merchant_id": merchant_id,
        "order_id": order_id,
        "amount": amount,
        "amount_currency": amount_currency,
        "profit": profit,
        "profit_currency": profit_currency,
        "method": method,
        "hash": hash,
    }

    # Verify hash
    if not verify_webhook_hash(all_params, NICEPAY_SECRET_KEY):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid hash signature"
        )

    # Verify merchant_id matches
    if merchant_id != NICEPAY_MERCHANT_ID:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid merchant ID"
        )

    # Find the payment record
    payment = db.query(Payment).filter(Payment.order_id == order_id).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )

    # Update payment record (prevent double-processing)
    if payment.status == "success" or payment.status == "error":
        # Already processed, just return OK
        return {"status": "ok"}

    if result == "success":
        payment.status = "success"
        payment.nicepay_payment_id = payment_id

        # Update user's subscription
        user = db.query(User).filter(User.id == payment.user_id).first()
        if user:
            user.available_analyses += payment.analyses_count
            user.subscription_expiry = datetime.utcnow() + timedelta(days=payment.validity_days)
            user.updated_at = datetime.utcnow()
    else:
        payment.status = "error"

    payment.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "ok"}


@app.post("/chat/create")
def create_chat(
    request: CreateChatRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Создает новый чат для авторизованного пользователя
    Args:
        request: Запрос с параметрами создания чата
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о созданном чате
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        result = ai_chat_service.create_chat(
            user_phone=user.phone_number,
            title=request.title,
            initial_prompt=request.initial_prompt
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create chat: {str(e)}"
        )
@app.post("/chat/send")
def send_message(
    request: SendMessageRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Ставит сообщение в очередь на фоновую генерацию со стримингом через Redis.
    Args:
        request: Запрос с сообщением
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о задаче и chat_id
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_chat_id = ai_chat_service._get_current_chat_id(user.phone_number)
    if not current_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active chat found for user."
        )

    from celery_app import process_message_stream_task

    task = process_message_stream_task.apply_async(args=[user.phone_number, request.message])

    return {
        "status": "queued",
        "task_id": task.id,
        "chat_id": current_chat_id,
    }


@app.post("/chat/send-stream")
def send_message_stream(
    request: SendMessageRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Запускает фоновую генерацию и возвращает SSE-стрим из Redis.
    Если для этого чата уже идёт генерация — подключается к ней."""
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_chat_id = ai_chat_service._get_current_chat_id(user.phone_number)
    if not current_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active chat found for user."
        )

    r = _get_redis()
    status_key = _stream_status_key(current_chat_id)
    stream_key = _stream_key(current_chat_id)
    existing = r.get(status_key)

    if not existing or json.loads(existing).get("status") != "generating":
        r.delete(stream_key)
        r.delete(status_key)
        from celery_app import process_message_stream_task
        process_message_stream_task.apply_async(args=[user.phone_number, request.message])

    async def event_generator():
        yield "event: connected\ndata: {}\n\n"

        last_pos = 0
        started_at = time.time()

        while True:
            try:
                status_raw = r.get(status_key)
                if status_raw:
                    status_data = json.loads(status_raw)
                else:
                    status_data = {"status": "generating", "partial_content": "", "position": 0}

                chunks = r.lrange(stream_key, last_pos, -1)
                for chunk_raw in chunks:
                    chunk_data = json.loads(chunk_raw)
                    if chunk_data.get("type") == "error":
                        yield f"data: {json.dumps({'error': chunk_data.get('error', 'Unknown error')})}\n\n"
                    elif chunk_data.get("type") == "complete":
                        yield f"data: {json.dumps({'type': 'complete', 'content': chunk_data.get('content', '')})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'stream', 'content': chunk_data.get('content', ''), 'phase': chunk_data.get('phase', 'answer')})}\n\n"
                    last_pos += 1

                if status_data.get("status") in ("completed", "error"):
                    break

                await asyncio.sleep(0.15)

                if time.time() - started_at > 600:
                    yield f"data: {json.dumps({'type': 'complete', 'content': status_data.get('partial_content', '')})}\n\n"
                    break

                if await _client_disconnected(db):
                    break

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _client_disconnected(db):
    return False


@app.get("/chat/stream-status")
def get_stream_status(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Возвращает статус текущей генерации для чата пользователя.
    Используется для реконнекта после перезагрузки страницы."""
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_chat_id = ai_chat_service._get_current_chat_id(user.phone_number)
    if not current_chat_id:
        return {"is_generating": False, "partial_content": "", "position": 0}

    r = _get_redis()
    status_raw = r.get(_stream_status_key(current_chat_id))
    if not status_raw:
        return {"is_generating": False, "partial_content": "", "position": 0}

    status_data = json.loads(status_raw)
    return {
        "is_generating": status_data.get("status") == "generating",
        "partial_content": status_data.get("partial_content", ""),
        "position": status_data.get("position", 0),
        "chat_id": current_chat_id,
        "status": status_data.get("status"),
    }


@app.get("/chat/stream/listen")
def listen_to_stream(
    position: int = Query(0),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """SSE эндпоинт для прослушивания стрима с указанной позиции.
    Используется при реконнекте — клиент передаёт последнюю известную позицию."""
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    current_chat_id = ai_chat_service._get_current_chat_id(user.phone_number)
    if not current_chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active chat found for user."
        )

    r = _get_redis()

    async def event_generator():
        yield "event: connected\ndata: {}\n\n"

        stream_key = _stream_key(current_chat_id)
        status_key = _stream_status_key(current_chat_id)
        last_pos = position
        started_at = time.time()

        while True:
            try:
                status_raw = r.get(status_key)
                if status_raw:
                    status_data = json.loads(status_raw)
                else:
                    status_data = {"status": "generating", "partial_content": "", "position": 0}

                total_len = r.llen(stream_key)
                while last_pos < total_len:
                    chunk_raw = r.lindex(stream_key, last_pos)
                    if chunk_raw:
                        chunk_data = json.loads(chunk_raw)
                        if chunk_data.get("type") == "error":
                            yield f"data: {json.dumps({'error': chunk_data.get('error', 'Unknown error')})}\n\n"
                        elif chunk_data.get("type") == "complete":
                            yield f"data: {json.dumps({'type': 'complete', 'content': chunk_data.get('content', '')})}\n\n"
                        else:
                            yield f"data: {json.dumps({'type': 'stream', 'content': chunk_data.get('content', ''), 'phase': chunk_data.get('phase', 'answer')})}\n\n"
                    last_pos += 1

                if status_data.get("status") in ("completed", "error"):
                    break

                await asyncio.sleep(0.15)

                if time.time() - started_at > 600:
                    yield f"data: {json.dumps({'type': 'complete', 'content': status_data.get('partial_content', '')})}\n\n"
                    break

            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
@app.get("/chat/task/{task_id}")
def get_task_result(task_id: str):
    """Возвращает результат обработки сообщения
    Args:
        task_id: Идентификатор задачи
    Returns:
        dict: Словарь с результатом задачи
    """
    from celery_app import app as celery_app
    result = celery_app.AsyncResult(task_id)
    if result.state == 'PENDING':
        return {"status": "processing"}
    elif result.state == 'SUCCESS':
        return {
            "status": "completed",
            "result": result.result
        }
    else:
        return {
            "status": "failed",
            "error": str(result.result) if result.result else "Unknown error"
        }
@app.post("/chat/clear")
def clear_chat(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Очищает чат авторизованного пользователя
    Args:
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с результатом операции
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        success = ai_chat_service.clear_chat(user.phone_number)
        if success:
            return {"status": "success", "message": "Chat cleared successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to clear chat"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear chat: {str(e)}"
        )
@app.get("/initial-prompt", response_model=InitialPromptResponse)
def get_initial_prompt():
    """Возвращает начальный промпт для чата из файла
    Returns:
        InitialPromptResponse: Объект с начальным промптом
    """
    try:
        prompt_path = os.path.join("prompts", "initial_prompt.txt")
        with open(prompt_path, 'r', encoding='utf-8') as f:
            initial_prompt = f.read()
        return {"initial_prompt": initial_prompt}
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Initial prompt file not found"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read initial prompt: {str(e)}"
        )
@app.get("/chats", response_model=ChatListResponse)
def get_user_chats(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Возвращает список чатов пользователя
    Args:
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        ChatListResponse: Объект со списком чатов пользователя
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_chats = db.query(Chat).filter(
        Chat.user_id == user.id,
        Chat.is_active == True
    ).order_by(Chat.updated_at.desc()).all()
    chats_list = []
    for chat in user_chats:
        chats_list.append({
            "id": chat.chat_id,
            "title": chat.title,
            "created_at": chat.created_at.isoformat() if chat.created_at else None,
            "updated_at": chat.updated_at.isoformat() if chat.updated_at else None
        })
    return {"chats": chats_list}
@app.post("/chat/switch")
def switch_chat(
    request: SwitchChatRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Переключается на существующий чат пользователя
    Args:
        request: Запрос с идентификатором чата
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о переключенном чате
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    chat = db.query(Chat).filter(
        Chat.chat_id == request.chat_id,
        Chat.user_id == user.id,
        Chat.is_active == True
    ).first()
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found or does not belong to user"
        )
    success = ai_chat_service.update_current_chat(user.phone_number, request.chat_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to switch chat"
        )
    messages = ai_chat_service.get_messages_for_chat(user.phone_number, request.chat_id)
    return {
        "chat_id": chat.chat_id,
        "title": chat.title,
        "status": "switched",
        "messages": messages or []
    }
@app.get("/chat/{chat_id}/messages")
def get_chat_messages(
    chat_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Возвращает историю сообщений для конкретного чата
    Args:
        chat_id: Идентификатор чата
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с сообщениями чата
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    chat = db.query(Chat).filter(
        Chat.chat_id == chat_id,
        Chat.user_id == user.id,
        Chat.is_active == True
    ).first()
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found or does not belong to user"
        )
    messages = ai_chat_service.get_messages_for_chat(user.phone_number, chat_id)
    return {"messages": messages or []}
@app.delete("/chat/{chat_id}")
def delete_chat(
    chat_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Удаляет чат пользователя (деактивирует в базе данных)
    Args:
        chat_id: Идентификатор чата
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с результатом операции
    """
    token_data = verify_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    chat = db.query(Chat).filter(
        Chat.chat_id == chat_id,
        Chat.user_id == user.id
    ).first()
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found or does not belong to user"
        )
    success = ai_chat_service.deactivate_chat(user.phone_number, chat_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete chat"
        )
    return {
        "status": "deleted",
        "chat_id": chat_id
    }
class UpdateChatTitleRequest(BaseModel):
    """Модель для обновления названия чата"""
    title: str
@app.put("/chat/{chat_id}/title")
def update_chat_title(
    chat_id: str,
    request: UpdateChatTitleRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Обновляет название чата пользователя
    Args:
        chat_id: Идентификатор чата
        request: Запрос с новым названием
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с результатом операции
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Аккаунт пользователя деактивирован",
            headers={"WWW-Authenticate": "Bearer"},
        )
    chat = db.query(Chat).filter(
        Chat.chat_id == chat_id,
        Chat.user_id == user.id
    ).first()
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found or does not belong to user"
        )
    chat.title = request.title
    chat.updated_at = datetime.utcnow()
    db.commit()
    return {
        "status": "success",
        "chat_id": chat_id,
        "title": request.title
    }
import secrets

class TelegramRegisterRequest(BaseModel):
    """Модель для регистрации через Telegram"""
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_number: str

@app.post("/auth/register/telegram")
def register_telegram_user(
    request: TelegramRegisterRequest,
    db: Session = Depends(get_db)
):
    """Регистрация нового пользователя через Telegram
    Args:
        request: Данные пользователя из Telegram
        db: Сессия базы данных
    Returns:
        dict: Словарь с токеном доступа и данными пользователя
    """
    # Normalize phone number
    normalized_phone = normalize_phone_number(request.phone_number)

    # Проверка формата номера телефона
    phone_pattern = re.compile(r'^\+?1?\d{9,15}$')
    if not phone_pattern.match(request.phone_number):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный формат номера телефона"
        )

    # Проверка существующего пользователя
    user = db.query(User).filter(User.phone_number == normalized_phone).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с таким номером уже существует"
        )
    
    # Создание имени пользователя из данных Telegram
    name = request.first_name or ""
    if request.last_name:
        name += f" {request.last_name}"
    name = name.strip() or request.username or "Telegram User"
    
    # Генерация случайного пароля для аккаунта
    random_password = secrets.token_urlsafe(32)
    hashed_password = get_password_hash(random_password)
    
    # Создание нового пользователя
    new_user = User(
        phone_number=normalized_phone,
        name=name,
        birth_date=None,
        password_hash=hashed_password,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Создание записи TelegramUser
    telegram_user = TelegramUser(
        telegram_id=request.telegram_id,
        username=request.username,
        first_name=request.first_name,
        last_name=request.last_name,
        phone_number=request.phone_number,
        is_verified=True
    )
    db.add(telegram_user)
    db.commit()
    
    # Генерация токена доступа
    access_token = create_access_token(
        data={"sub": new_user.phone_number},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "phone_number": new_user.phone_number,
            "name": new_user.name
        }
    }
class TelegramAuthRequest(BaseModel):
    """Модель для аутентификации через Telegram"""
    telegram_id: int
    phone_number: str
@app.post("/telegram/auth")
def telegram_auth(request: TelegramAuthRequest, db: Session = Depends(get_db)):
    """Аутентификация пользователя через Telegram ID и проверенный номер телефона
    Args:
        request: Запрос с идентификатором Telegram и номером телефона
        db: Сессия базы данных
    Returns:
        dict: Словарь с токеном доступа
    """
    # Normalize phone number
    normalized_phone = normalize_phone_number(request.phone_number)

    user = db.query(User).filter(User.phone_number == normalized_phone).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    telegram_user = db.query(TelegramUser).filter(
        TelegramUser.telegram_id == request.telegram_id,
        TelegramUser.phone_number == normalized_phone,
        TelegramUser.is_verified == True
    ).first()
    if not telegram_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Telegram account not linked or not verified"
        )
    access_token = create_access_token(
        data={"sub": user.phone_number},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    telegram_user.access_token = access_token
    db.commit()
@app.post("/use-analysis-credit")
def use_analysis_credit(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Списывает один кредит глубокого анализа у пользователя.
    Вызывается фронтендом при обнаружении TRIGGER_USE_ANALYSIS_CREDIT в ответе AI.
    Args:
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Обновлённый баланс кредитов
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.phone_number == token_data.phone_number).first()
    if user is None:
        raise credentials_exception
    if (user.available_analyses or 0) < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нет доступных кредитов для глубокого анализа",
        )
    user.available_analyses -= 1
    user.updated_at = datetime.utcnow()
    db.commit()
    return {
        "status": "success",
        "available_analyses": user.available_analyses,
        "message": "Кредит глубокого анализа использован",
    }


# ---------------------------------------------------------------------------
# Text-to-Speech (TTS)
# ---------------------------------------------------------------------------
# Серверная озвучка через edge-tts. В отличие от браузерного SpeechSynthesis,
# она не зависит от голосов, установленных в ОС пользователя, поэтому работает
# в ЛЮБОМ браузере и поддерживает любой язык (~100 локалей, включая русский).
# Клиент использует это как основной путь, а Web Speech API — как фолбэк.

class TTSRequest(BaseModel):
    """Модель запроса озвучивания текста"""
    text: str
    lang: Optional[str] = None  # необязательная подсказка языка (ISO 639-1)


# Язык (ISO 639-1) -> голос edge-tts (ShortName)
_TTS_VOICES = {
    "ru": "ru-RU-SvetlanaNeural",
    "uk": "uk-UA-PolinaNeural",
    "en": "en-US-AriaNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "it": "it-IT-ElsaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "pl": "pl-PL-ZofiaNeural",
    "nl": "nl-NL-ColetteNeural",
    "tr": "tr-TR-EmelNeural",
    "ar": "ar-SA-ZariyahNeural",
    "hi": "hi-IN-SwaraNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "kk": "kk-KZ-AigulNeural",
    "he": "he-IL-HilaNeural",
    "el": "el-GR-AthinaNeural",
    "th": "th-TH-PremwadeeNeural",
    "vi": "vi-VN-HoaiMyNeural",
    "id": "id-ID-GadisNeural",
    "cs": "cs-CZ-VlastaNeural",
    "ro": "ro-RO-AlinaNeural",
    "hu": "hu-HU-NoemiNeural",
    "sv": "sv-SE-SofieNeural",
    "fi": "fi-FI-NooraNeural",
    "az": "az-AZ-BanuNeural",
}

_DEFAULT_TTS_VOICE = "en-US-AriaNeural"


def _detect_tts_lang(text: str) -> str:
    """Грубое определение языка по преобладающей письменности — для подбора голоса."""
    counts: dict = {}
    for ch in text:
        o = ord(ch)
        if 0x0400 <= o <= 0x04FF:          # Cyrillic
            counts["cyr"] = counts.get("cyr", 0) + 1
        elif 0x3040 <= o <= 0x30FF:        # Hiragana / Katakana
            counts["kana"] = counts.get("kana", 0) + 1
        elif 0x4E00 <= o <= 0x9FFF:        # CJK Unified (китайский / кандзи)
            counts["han"] = counts.get("han", 0) + 1
        elif 0xAC00 <= o <= 0xD7A3:        # Hangul
            counts["hangul"] = counts.get("hangul", 0) + 1
        elif 0x0600 <= o <= 0x06FF:        # Arabic
            counts["arab"] = counts.get("arab", 0) + 1
        elif 0x0590 <= o <= 0x05FF:        # Hebrew
            counts["hebrew"] = counts.get("hebrew", 0) + 1
        elif 0x0900 <= o <= 0x097F:        # Devanagari
            counts["deva"] = counts.get("deva", 0) + 1
        elif 0x0370 <= o <= 0x03FF:        # Greek
            counts["greek"] = counts.get("greek", 0) + 1
        elif 0x0E00 <= o <= 0x0E7F:        # Thai
            counts["thai"] = counts.get("thai", 0) + 1
        elif 0x0041 <= o <= 0x024F:        # Latin
            counts["lat"] = counts.get("lat", 0) + 1

    if not counts:
        return "en"

    dominant = max(counts, key=counts.get)
    mapping = {
        "kana": "ja", "han": "zh", "hangul": "ko", "arab": "ar",
        "hebrew": "he", "deva": "hi", "greek": "el", "thai": "th",
    }
    if dominant in mapping:
        return mapping[dominant]
    if dominant == "cyr":
        # украинский — по специфичным буквам
        if any(c in text for c in "іїєґІЇЄҐ"):
            return "uk"
        return "ru"
    return "en"


@app.post("/tts")
async def text_to_speech(request: TTSRequest, token: str = Depends(oauth2_scheme)):
    """Озвучивает переданный текст на сервере (edge-tts) и возвращает MP3.
    Работает в любом браузере независимо от наличия системных голосов.
    Args:
        request: Текст и (опционально) подсказка языка
        token: Токен доступа
    Returns:
        Response: Аудио в формате audio/mpeg
    """
    if verify_token(token) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty text")
    # Ограничиваем длину, чтобы не нагружать сервис озвучки
    text = text[:5000]

    lang = (request.lang or "").lower().split("-")[0] or _detect_tts_lang(text)
    voice = _TTS_VOICES.get(lang, _DEFAULT_TTS_VOICE)

    try:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.extend(chunk["data"])

        if not audio:
            raise RuntimeError("No audio produced")

        return Response(
            content=bytes(audio),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )
    except Exception as e:
        # Любая ошибка (нет пакета, нет сети до сервиса и т.п.) — клиент сам
        # переключится на браузерную озвучку.
        print(f"TTS error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="TTS service unavailable",
        )


@app.get("/health")
def health_check():
    """Health check endpoint for Docker container health status
    Returns:
        dict: Health status of the application
    """
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}
