from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import re
import json
from database import get_db
from models import User, Chat
from auth import get_password_hash, authenticate_user, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, verify_token, TokenData
from ai_service import ai_chat_service
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
import os

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

# CORS configuration - specify exact origins for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",      # React dev server
        "http://127.0.0.1:3000",      # Alternative localhost
        "http://localhost:8000",      # Self-origin
        "http://127.0.0.1:8000",      # Alternative self-origin
        "https://api.jdh-team.ru",    # Production backend
        "https://dream-interpreter.jdh-team.ru",  # Production frontend
        "http://dream-interpreter.jdh-team.ru",   # Alternative protocol
        "https://amnis.jdh-team.ru",  # Production frontend domain from error
    ],
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
    """Ставит сообщение в очередь на обработку
    Args:
        request: Запрос с сообщением
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        dict: Словарь с информацией о задаче
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
        from celery_app import process_message_task
        task = process_message_task.apply_async(args=[user.phone_number, request.message])
        return {
            "status": "queued",
            "task_id": task.id
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to queue message: {str(e)}"
        )

@app.post("/chat/send-stream")
def send_message_stream(
    request: SendMessageRequest,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Отправляет сообщение в чат и возвращает ответ от ИИ в режиме потоковой передачи
    Args:
        request: Запрос с сообщением
        token: Токен доступа
        db: Сессия базы данных
    Returns:
        StreamingResponse: Потоковый ответ от ИИ
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

    def event_generator():
        try:
            for chunk in ai_chat_service.send_message(user.phone_number, request.message):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
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
from models import TelegramUser
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
@app.get("/health")
def health_check():
    """Health check endpoint for Docker container health status
    Returns:
        dict: Health status of the application
    """
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}